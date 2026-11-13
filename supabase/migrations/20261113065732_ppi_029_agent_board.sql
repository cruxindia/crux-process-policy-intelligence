-- PPI-029: expert agent teams and the background review board (D-064…).
-- Teams of AI specialists (versioned charters stored here, not in chat) review processes and draft documents;
-- every turn is kept (append-only) and nothing becomes official until a person approves the result.

-- 1. Owner may accept a training provider for CONFIDENTIAL data too (13-Nov-2026). Restricted data (customers' personal
--    data) can never go to a provider that trains on inputs.
alter table public.ai_provider_policies drop constraint ai_provider_policies_training_check;
alter table public.ai_provider_policies add constraint ai_provider_policies_training_check check (
  not may_train_on_inputs
  or max_classification = 'public'
  or (max_classification in ('internal', 'confidential')
      and training_accepted_by_membership_id is not null
      and training_accepted_on is not null
      and length(coalesce(training_acceptance_note, '')) >= 20)
);

-- 2. AI run capability for board turns; connection assignments per expert team ("team:<code>").
alter table public.ai_runs drop constraint ai_runs_capability_check;
alter table public.ai_runs add constraint ai_runs_capability_check check (capability in ('interview_followup','answer_extraction',
  'process_architect','contradiction_analysis','risk_control_analysis','legal_source_research','document_draft','completeness_review',
  'change_impact','summary','board_turn'));
alter table public.ai_connection_assignments drop constraint ai_connection_assignments_interview_category_check;
alter table public.ai_connection_assignments add constraint ai_connection_assignments_interview_category_check check (
  interview_category is null or interview_category in ('discovery', 'adaptive', 'review', 'documents')
  or interview_category ~ '^team:[a-z_]{2,30}$');

-- 3. Teams and versioned roles.
create table public.agent_teams (
  id          uuid not null default gen_random_uuid(),
  company_id  uuid not null references public.companies(id),
  code        text not null check (code ~ '^[a-z_]{2,30}$'),
  name        text not null check (length(name) between 2 and 120),
  mission     text not null,
  sort_order  smallint not null default 100,
  status      text not null default 'active' check (status in ('active', 'retired')),
  created_at  timestamptz not null default now(),
  primary key (id), unique (company_id, id), unique (company_id, code)
);
create table public.agent_roles (
  id              uuid not null default gen_random_uuid(),
  company_id      uuid not null references public.companies(id),
  team_id         uuid not null,
  code            text not null check (code ~ '^[a-z_]{2,40}$'),
  version         int not null check (version >= 1),
  title           text not null,
  credentials     text not null,                     -- the professional standard the role reasons like (not a real certification)
  charter         text not null check (length(charter) >= 200),
  charter_sha256  text not null check (charter_sha256 ~ '^[0-9a-f]{64}$'),
  status          text not null default 'active' check (status in ('active', 'retired')),
  created_at      timestamptz not null default now(),
  primary key (id), unique (company_id, id), unique (company_id, code, version),
  foreign key (company_id, team_id) references public.agent_teams(company_id, id)
);
create unique index agent_roles_one_active on public.agent_roles (company_id, code) where status = 'active';
create index agent_roles_team_idx on public.agent_roles (company_id, team_id);
-- A charter can be retired, never edited: change = new version (keeps every past turn explainable).
create or replace function private.agent_role_guard() returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' then raise exception 'PPI_IMMUTABLE: agent roles cannot be deleted' using errcode = 'P0001'; end if;
  if (new.code, new.version, new.charter, new.charter_sha256, new.team_id, new.title, new.credentials)
     is distinct from (old.code, old.version, old.charter, old.charter_sha256, old.team_id, old.title, old.credentials) then
    raise exception 'PPI_IMMUTABLE: create a new charter version instead of editing' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger agent_roles_guard before update or delete on public.agent_roles for each row execute function private.agent_role_guard();
create or replace function private.agent_role_hash() returns trigger language plpgsql set search_path = '' as $$
begin
  if new.charter_sha256 is distinct from encode(extensions.digest(new.charter, 'sha256'), 'hex') then
    raise exception 'PPI_INPUT: charter hash does not match charter text' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger agent_roles_hash before insert on public.agent_roles for each row execute function private.agent_role_hash();

-- 4. Board cases, turns (append-only) and outputs (append-only).
create table public.board_cases (
  id                       uuid not null default gen_random_uuid(),
  company_id               uuid not null references public.companies(id),
  kind                     text not null check (kind in ('improvement_review', 'document_draft')),
  doc_type                 text check (doc_type in ('policy', 'sop', 'agreement', 'board_resolution', 'compliance_checklist', 'charter', 'other')),
  title                    text not null check (length(title) between 3 and 200),
  brief                    text not null default '' check (length(brief) <= 6000),
  source_process_ids       uuid[] not null default '{}',
  classification           text not null default 'internal' check (classification in ('public', 'internal', 'confidential', 'restricted')),
  status                   text not null default 'queued'
                           check (status in ('queued', 'running', 'waiting', 'awaiting_approval', 'approved', 'rejected', 'failed')),
  plan                     jsonb,                      -- ordered steps [{role, kind, to[]}], set by the board engine
  next_step                int not null default 0,
  revision_rounds          smallint not null default 0,
  last_error               text,
  run_lock_until           timestamptz,
  created_by_membership_id uuid not null,
  decided_by_membership_id uuid,
  decided_at               timestamptz,
  decision_note            text,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  primary key (id), unique (company_id, id),
  foreign key (company_id, created_by_membership_id) references public.memberships(company_id, id),
  foreign key (company_id, decided_by_membership_id) references public.memberships(company_id, id),
  check ((kind = 'document_draft') = (doc_type is not null))
);
create index board_cases_company_idx on public.board_cases (company_id, created_at desc);
create index board_cases_creator_idx on public.board_cases (company_id, created_by_membership_id);
create index board_cases_decider_idx on public.board_cases (company_id, decided_by_membership_id);

create table public.board_turns (
  id            uuid not null default gen_random_uuid(),
  company_id    uuid not null references public.companies(id),
  case_id       uuid not null,
  seq           int not null check (seq >= 1),
  step          int not null,
  role_id       uuid not null,
  role_code     text not null,
  team_code     text not null,
  kind          text not null check (kind in ('proposal', 'critique', 'consolidation', 'format', 'audit')),
  addressed_to  text[] not null default '{}',
  summary       text not null,
  content       text not null,
  key_points    text[] not null default '{}',
  citations     text[] not null default '{}',
  verdict       text check (verdict in ('pass', 'revise', 'fail')),
  ai_run_id     uuid,
  created_at    timestamptz not null default now(),
  primary key (id), unique (case_id, seq),
  foreign key (company_id, case_id) references public.board_cases(company_id, id),
  foreign key (company_id, role_id) references public.agent_roles(company_id, id),
  foreign key (company_id, ai_run_id) references public.ai_runs(company_id, id)
);
create index board_turns_case_idx on public.board_turns (company_id, case_id, seq);
create index board_turns_role_idx on public.board_turns (company_id, role_id);
create index board_turns_run_idx on public.board_turns (company_id, ai_run_id);

create table public.board_outputs (
  id            uuid not null default gen_random_uuid(),
  company_id    uuid not null references public.companies(id),
  case_id       uuid not null,
  version       int not null check (version >= 1),
  title         text not null,
  body_md       text not null,
  dissent       text,
  audit_verdict text check (audit_verdict in ('pass', 'revise', 'fail')),
  audit_notes   text,
  created_at    timestamptz not null default now(),
  primary key (id), unique (case_id, version),
  foreign key (company_id, case_id) references public.board_cases(company_id, id)
);
create index board_outputs_case_idx on public.board_outputs (company_id, case_id, version desc);

create trigger board_turns_append_only before update or delete on public.board_turns for each row execute function private.forbid_mutation();
create trigger board_outputs_append_only before update or delete on public.board_outputs for each row execute function private.forbid_mutation();
create trigger board_cases_no_delete before delete on public.board_cases for each row execute function private.forbid_mutation();
create trigger board_cases_updated before update on public.board_cases for each row execute function private.set_updated_at();
create trigger audit_board_cases after insert or update on public.board_cases for each row execute function private.audit_row();

-- Board cases are company-level work: a role held in ANY scope (e.g. a department head's document.draft) qualifies.
create or replace function private.has_permission_anywhere(p_company uuid, p_perm text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.role_assignments ra
      join public.role_permissions rp on rp.company_id = ra.company_id and rp.role_id = ra.role_id and rp.permission_code = p_perm
     where ra.company_id = p_company and ra.membership_id = private.my_membership(p_company)
       and ra.status = 'active' and ra.valid_from <= now() and (ra.valid_to is null or ra.valid_to > now()))
$$;
revoke all on function private.has_permission_anywhere(uuid, text) from public, anon;
grant execute on function private.has_permission_anywhere(uuid, text) to authenticated, service_role;

-- 5. Access: who may read a case. Creator; reviewers/document readers; confidential+ also needs confidential read.
create or replace function private.can_read_board_case(p_company uuid, p_case uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.board_cases c
     where c.company_id = p_company and c.id = p_case
       and (c.created_by_membership_id = private.my_membership(p_company)
            or ((private.has_permission_anywhere(p_company, 'document.read') or private.has_permission_anywhere(p_company, 'interview.review')
                 or private.has_permission_anywhere(p_company, 'org.manage'))
                and (private.classification_rank(c.classification) <= 1
                     or private.has_permission_anywhere(p_company, 'classified.confidential_read')
                     or private.has_permission_anywhere(p_company, 'org.manage')))))
$$;
revoke all on function private.can_read_board_case(uuid, uuid) from public, anon;
grant execute on function private.can_read_board_case(uuid, uuid) to authenticated, service_role;

alter table public.agent_teams enable row level security;
alter table public.agent_roles enable row level security;
alter table public.board_cases enable row level security;
alter table public.board_turns enable row level security;
alter table public.board_outputs enable row level security;
create policy agent_teams_read on public.agent_teams for select to authenticated using ((select private.my_membership(company_id)) is not null);
create policy agent_roles_read on public.agent_roles for select to authenticated using ((select private.my_membership(company_id)) is not null);
create policy board_cases_read on public.board_cases for select to authenticated using ((select private.can_read_board_case(company_id, id)));
create policy board_turns_read on public.board_turns for select to authenticated using ((select private.can_read_board_case(company_id, case_id)));
create policy board_outputs_read on public.board_outputs for select to authenticated using ((select private.can_read_board_case(company_id, case_id)));
revoke insert, update, delete, truncate, references, trigger on public.agent_teams, public.agent_roles, public.board_cases,
       public.board_turns, public.board_outputs from authenticated;
revoke all on public.agent_teams, public.agent_roles, public.board_cases, public.board_turns, public.board_outputs from anon;

-- 6. Opening a case (people only) and deciding it (approvers only).
create or replace function public.open_board_case(p_company uuid, p_kind text, p_doc_type text, p_title text, p_brief text,
                                                  p_process_ids uuid[], p_classification text default 'internal')
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_mid uuid := private.my_membership(p_company); v_id uuid; v_pid uuid; v_sess uuid;
begin
  if v_mid is null or not private.is_human_actor(p_company) then
    raise exception 'PPI_FORBIDDEN: only people can open a board case' using errcode = '42501';
  end if;
  if p_kind = 'improvement_review' then
    if not (private.has_permission_anywhere(p_company, 'interview.review') or private.has_permission_anywhere(p_company, 'process.edit')
            or private.has_permission_anywhere(p_company, 'org.manage')) then
      raise exception 'PPI_FORBIDDEN: reviewers only' using errcode = '42501';
    end if;
    if coalesce(cardinality(p_process_ids), 0) = 0 then
      raise exception 'PPI_INPUT: choose at least one process to review' using errcode = 'P0001';
    end if;
  elsif p_kind = 'document_draft' then
    if not (private.has_permission_anywhere(p_company, 'document.draft') or private.has_permission_anywhere(p_company, 'org.manage')) then
      raise exception 'PPI_FORBIDDEN: you cannot draft documents' using errcode = '42501';
    end if;
  else
    raise exception 'PPI_INPUT: unknown case kind' using errcode = 'P0001';
  end if;
  if coalesce(cardinality(p_process_ids), 0) > 10 then raise exception 'PPI_INPUT: at most 10 processes per case' using errcode = 'P0001'; end if;
  foreach v_pid in array coalesce(p_process_ids, '{}') loop
    select session_id into v_sess from public.discovered_processes where company_id = p_company and id = v_pid;
    if v_sess is null or not private.can_read_session(p_company, v_sess) then
      raise exception 'PPI_INPUT: a selected process was not found' using errcode = 'P0001';
    end if;
  end loop;
  if p_classification in ('confidential', 'restricted') and not (private.has_permission_anywhere(p_company, 'classified.confidential_read')
                                                                   or private.has_permission_anywhere(p_company, 'org.manage')) then
    raise exception 'PPI_FORBIDDEN: you cannot open confidential cases' using errcode = '42501';
  end if;
  insert into public.board_cases (company_id, kind, doc_type, title, brief, source_process_ids, classification, created_by_membership_id)
  values (p_company, p_kind, case when p_kind = 'document_draft' then coalesce(p_doc_type, 'other') end, trim(p_title), coalesce(trim(p_brief), ''),
          coalesce(p_process_ids, '{}'), coalesce(p_classification, 'internal'), v_mid)
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.decide_board_case(p_company uuid, p_case uuid, p_decision text, p_note text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare v_mid uuid := private.my_membership(p_company);
begin
  if v_mid is null or not private.is_human_actor(p_company)
     or not (private.has_permission_anywhere(p_company, 'document.approve') or private.has_permission_anywhere(p_company, 'org.manage')) then
    raise exception 'PPI_FORBIDDEN: approvers only' using errcode = '42501';
  end if;
  if p_decision not in ('approved', 'rejected') then raise exception 'PPI_INPUT: approve or reject' using errcode = 'P0001'; end if;
  if p_decision = 'rejected' and length(coalesce(trim(p_note), '')) < 5 then
    raise exception 'PPI_INPUT: say why it is rejected' using errcode = 'P0001';
  end if;
  update public.board_cases set status = p_decision, decided_by_membership_id = v_mid, decided_at = now(), decision_note = nullif(trim(p_note), '')
   where company_id = p_company and id = p_case and status = 'awaiting_approval' and private.can_read_board_case(p_company, p_case);
  if not found then raise exception 'PPI_INPUT: this case is not waiting for a decision' using errcode = 'P0001'; end if;
end $$;
revoke all on function public.open_board_case(uuid, text, text, text, text, uuid[], text) from public, anon;
revoke all on function public.decide_board_case(uuid, uuid, text, text) from public, anon;
grant execute on function public.open_board_case(uuid, text, text, text, text, uuid[], text) to authenticated;
grant execute on function public.decide_board_case(uuid, uuid, text, text) to authenticated;
