-- PPI-010 AI provenance + provider data policy (NFR-09, AC-10), background jobs (NFR-06, AC-11), notifications (FR-15).

create table public.prompt_versions (
  id               uuid not null default gen_random_uuid() primary key,
  company_id       uuid not null references public.companies(id),
  prompt_key       text not null,           -- e.g. interview.followup, extract.process_steps
  version          int  not null check (version > 0),
  purpose          text not null,
  template_sha256  text not null check (template_sha256 ~ '^[0-9a-f]{64}$'),
  output_schema    jsonb not null,
  status           text not null default 'draft' check (status in ('draft','active','retired')),
  created_at       timestamptz not null default now(),
  unique (company_id, id),
  unique (company_id, prompt_key, version)
);

-- Which provider may receive which data class. Unpaid/free tiers that may train on or human-review
-- inputs must be limited to 'public' (D-011, Gemini API unpaid-service terms checked 2026-11-11).
create table public.ai_provider_policies (
  id                 uuid not null default gen_random_uuid() primary key,
  company_id         uuid not null references public.companies(id),
  provider           text not null,                 -- local_ollama, gemini_free, gemini_paid, groq_free, ...
  max_classification text not null check (max_classification in ('public','internal','confidential','restricted')),
  may_train_on_inputs boolean not null,
  terms_checked_on   date not null,
  status             text not null default 'active' check (status in ('active','disabled')),
  notes              text,
  created_at         timestamptz not null default now(),
  unique (company_id, provider),
  check (not may_train_on_inputs or max_classification = 'public')
);

create table public.ai_runs (
  id                       uuid not null default gen_random_uuid() primary key,
  company_id               uuid not null references public.companies(id),
  capability               text not null check (capability in ('interview_followup','answer_extraction','process_architect',
                                 'contradiction_analysis','risk_control_analysis','legal_source_research','document_draft',
                                 'completeness_review','change_impact','summary')),
  provider                 text not null,
  model                    text not null,
  prompt_version_id        uuid not null,
  data_classification      text not null check (data_classification in ('public','internal','confidential','restricted')),
  requested_by_membership_id uuid,
  context_source_ids       uuid[] not null default '{}',     -- authorised records actually sent
  input_sha256             text,
  output_sha256            text,
  status                   text not null default 'queued' check (status in ('queued','running','succeeded','failed','rejected')),
  schema_valid             boolean,
  unsupported_claim_count  int check (unsupported_claim_count >= 0),
  invalid_source_ref_count int check (invalid_source_ref_count >= 0),
  error_text               text,
  idempotency_key          text,
  created_at               timestamptz not null default now(),
  finished_at              timestamptz,
  unique (company_id, id),
  unique (company_id, idempotency_key),
  foreign key (company_id, prompt_version_id) references public.prompt_versions(company_id, id),
  foreign key (company_id, requested_by_membership_id) references public.memberships(company_id, id)
);
create index ai_runs_time_idx on public.ai_runs (company_id, created_at desc);

create or replace function private.ai_run_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_pol record;
begin
  if tg_op = 'UPDATE' and (new.provider, new.model, new.prompt_version_id, new.data_classification, new.capability,
                           new.context_source_ids, new.input_sha256, new.company_id)
                     is distinct from (old.provider, old.model, old.prompt_version_id, old.data_classification, old.capability,
                                       old.context_source_ids, old.input_sha256, old.company_id) then
    raise exception 'PPI_IMMUTABLE: AI run identity/provenance fields cannot change' using errcode = 'P0001';
  end if;
  if tg_op = 'INSERT' then
    select * into v_pol from public.ai_provider_policies
     where company_id = new.company_id and provider = new.provider and status = 'active';
    if v_pol.id is null then
      raise exception 'PPI_AI_POLICY: provider % is not approved for this company', new.provider using errcode = 'P0001';
    end if;
    if private.classification_rank(new.data_classification) > private.classification_rank(v_pol.max_classification) then
      raise exception 'PPI_AI_POLICY: provider % may not receive % data (max %)', new.provider, new.data_classification, v_pol.max_classification
        using errcode = 'P0001';
    end if;
    if not exists (select 1 from public.prompt_versions p where p.company_id = new.company_id and p.id = new.prompt_version_id and p.status = 'active') then
      raise exception 'PPI_AI_POLICY: prompt version must be active' using errcode = 'P0001';
    end if;
    if (select auth.uid()) is not null then new.requested_by_membership_id := private.my_membership(new.company_id); end if;
  end if;
  return new;
end $$;
create trigger ai_runs_guard before insert or update on public.ai_runs for each row execute function private.ai_run_guard();
create trigger ai_runs_no_delete before delete on public.ai_runs for each row execute function private.forbid_mutation();

-- Close forward references from earlier migrations.
alter table public.interview_questions
  add foreign key (company_id, prompt_version_id) references public.prompt_versions(company_id, id),
  add foreign key (company_id, ai_run_id) references public.ai_runs(company_id, id);
alter table public.knowledge_records
  add foreign key (company_id, ai_run_id) references public.ai_runs(company_id, id);

-- Background jobs: idempotent enqueue, SKIP LOCKED claim, bounded retries.
create table public.background_jobs (
  id              bigint generated always as identity primary key,
  company_id      uuid not null references public.companies(id),
  job_type        text not null,
  payload         jsonb not null default '{}'::jsonb,
  idempotency_key text not null,
  status          text not null default 'queued' check (status in ('queued','running','succeeded','failed','dead')),
  attempts        int  not null default 0,
  max_attempts    int  not null default 5 check (max_attempts > 0),
  run_after       timestamptz not null default now(),
  locked_at       timestamptz,
  locked_by       text,
  last_error      text,
  created_at      timestamptz not null default now(),
  finished_at     timestamptz,
  unique (company_id, job_type, idempotency_key)
);
create index background_jobs_ready_idx on public.background_jobs (run_after) where status in ('queued','failed');

-- Enqueue is idempotent: same (company, type, key) returns the existing job.
create or replace function private.enqueue_job(p_company uuid, p_type text, p_key text, p_payload jsonb default '{}'::jsonb)
returns bigint language plpgsql security definer set search_path = '' as $$
declare v_id bigint;
begin
  insert into public.background_jobs (company_id, job_type, idempotency_key, payload)
  values (p_company, p_type, p_key, p_payload)
  on conflict (company_id, job_type, idempotency_key) do nothing
  returning id into v_id;
  if v_id is null then
    select id into v_id from public.background_jobs where company_id = p_company and job_type = p_type and idempotency_key = p_key;
  end if;
  return v_id;
end $$;

create or replace function private.claim_jobs(p_worker text, p_limit int default 10)
returns setof public.background_jobs language sql security definer set search_path = '' as $$
  update public.background_jobs j set status = 'running', locked_at = now(), locked_by = p_worker, attempts = j.attempts + 1
   where j.id in (select id from public.background_jobs
                   where status in ('queued','failed') and run_after <= now() and attempts < max_attempts
                   order by run_after limit p_limit for update skip locked)
  returning j.*
$$;

create or replace function private.finish_job(p_id bigint, p_ok boolean, p_error text default null)
returns void language sql security definer set search_path = '' as $$
  update public.background_jobs
     set status = case when p_ok then 'succeeded' when attempts >= max_attempts then 'dead' else 'failed' end,
         last_error = p_error, finished_at = case when p_ok then now() end,
         run_after = case when p_ok then run_after else now() + make_interval(secs => least(3600, 30 * power(2, attempts))) end,
         locked_at = null, locked_by = null
   where id = p_id and status = 'running'
$$;
revoke execute on function private.enqueue_job(uuid, text, text, jsonb) from public, authenticated;
revoke execute on function private.claim_jobs(text, int) from public, authenticated;
revoke execute on function private.finish_job(bigint, boolean, text) from public, authenticated;
grant execute on function private.enqueue_job(uuid, text, text, jsonb) to service_role;
grant execute on function private.claim_jobs(text, int) to service_role;
grant execute on function private.finish_job(bigint, boolean, text) to service_role;

create table public.notifications (
  id                      uuid not null default gen_random_uuid() primary key,
  company_id              uuid not null,
  recipient_membership_id uuid not null,
  kind                    text not null,
  title                   text not null,
  object_type             text,
  object_id               uuid,
  dedupe_key              text not null,
  created_at              timestamptz not null default now(),
  read_at                 timestamptz,
  unique (company_id, recipient_membership_id, dedupe_key),     -- retries never duplicate (AC-11)
  foreign key (company_id, recipient_membership_id) references public.memberships(company_id, id)
);
create index notifications_inbox_idx on public.notifications (company_id, recipient_membership_id, created_at desc) where read_at is null;

create or replace function private.notification_guard() returns trigger
language plpgsql set search_path = '' as $$
begin
  if (new.company_id, new.recipient_membership_id, new.kind, new.title, new.object_type, new.object_id, new.dedupe_key, new.created_at)
     is distinct from (old.company_id, old.recipient_membership_id, old.kind, old.title, old.object_type, old.object_id, old.dedupe_key, old.created_at) then
    raise exception 'PPI_IMMUTABLE: only read_at can change on a notification' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger notifications_guard before update on public.notifications for each row execute function private.notification_guard();

-- Clarification assignment → idempotent notification to assignee.
create or replace function private.notify_clarification() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.assignee_membership_id is not null
     and (tg_op = 'INSERT' or new.assignee_membership_id is distinct from old.assignee_membership_id) then
    insert into public.notifications (company_id, recipient_membership_id, kind, title, object_type, object_id, dedupe_key)
    values (new.company_id, new.assignee_membership_id, 'clarification_assigned', 'Clarification ' || new.code || ' assigned to you',
            'clarification_task', new.id, 'clarification_assigned:' || new.id)
    on conflict do nothing;
  end if;
  return null;
end $$;
create trigger clarification_tasks_notify after insert or update on public.clarification_tasks
  for each row execute function private.notify_clarification();

grant execute on function private.classification_rank(text) to authenticated, service_role;

alter table public.prompt_versions      enable row level security;
alter table public.ai_provider_policies enable row level security;
alter table public.ai_runs              enable row level security;
alter table public.background_jobs      enable row level security;
alter table public.notifications        enable row level security;

create policy pv2_read on public.prompt_versions for select to authenticated using ((select private.is_active_member(company_id)));
create policy app_read on public.ai_provider_policies for select to authenticated using ((select private.is_active_member(company_id)));
create policy air_read on public.ai_runs for select to authenticated
  using (requested_by_membership_id = (select private.my_membership(company_id)) or (select private.has_permission(company_id, 'audit.read')));
create policy air_insert on public.ai_runs for insert to authenticated with check ((select private.has_permission(company_id, 'ai.run')));
-- background_jobs: no policy → invisible to authenticated; service_role (bypassrls) only.
create policy nt_read on public.notifications for select to authenticated
  using (recipient_membership_id = (select private.my_membership(company_id)));
create policy nt_update on public.notifications for update to authenticated
  using (recipient_membership_id = (select private.my_membership(company_id)))
  with check (recipient_membership_id = (select private.my_membership(company_id)));
