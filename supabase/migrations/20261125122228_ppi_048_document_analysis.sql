-- PPI-048: What the documents say (SOW 12G Q6). The doc-ai Edge Function reads one governing document at a time and stores:
-- the as-is processes it describes (with a flowchart), which checklist items it covers, and findings — gaps against what the
-- document should contain, loose ends, risks with suggested mitigations, and questions to ask the people who run the work.
-- Findings are proposals until a person confirms or rejects them. Missing documents are decided only when every rule
-- document has been analysed (doc_assessment_finalize), so nothing is called missing while it is still in the queue.

create table public.document_analyses (
  id           uuid not null default gen_random_uuid() primary key,
  company_id   uuid not null references public.companies(id),
  document_id  uuid not null,
  ai_run_id    uuid,
  result       jsonb not null,
  created_at   timestamptz not null default now(),
  unique (company_id, id),
  foreign key (company_id, document_id) references public.source_documents(company_id, id) on delete cascade,
  foreign key (company_id, ai_run_id) references public.ai_runs(company_id, id)
);
create index document_analyses_doc on public.document_analyses (company_id, document_id, created_at desc);
create index document_analyses_run on public.document_analyses (company_id, ai_run_id);

create table public.doc_processes (
  id              uuid not null default gen_random_uuid() primary key,
  company_id      uuid not null references public.companies(id),
  document_id     uuid not null,
  analysis_id     uuid not null,
  name            text not null check (length(name) between 1 and 200),
  department_code text check (department_code ~ '^[A-Z]{2,6}$'),
  owner_role      text,
  purpose         text,
  trigger_text    text,
  flow            jsonb not null default '{"nodes":[],"edges":[]}'::jsonb,
  controls        text[] not null default '{}',
  approvals       text[] not null default '{}',
  records         text[] not null default '{}',
  sla             text[] not null default '{}',
  created_at      timestamptz not null default now(),
  unique (company_id, id),
  foreign key (company_id, document_id) references public.source_documents(company_id, id) on delete cascade,
  foreign key (company_id, analysis_id) references public.document_analyses(company_id, id) on delete cascade
);
create index doc_processes_doc on public.doc_processes (company_id, document_id);
create index doc_processes_analysis on public.doc_processes (company_id, analysis_id);
create index doc_processes_dept on public.doc_processes (company_id, department_code);

create table public.doc_findings (
  id               uuid not null default gen_random_uuid() primary key,
  company_id       uuid not null references public.companies(id),
  document_id      uuid,
  analysis_id      uuid,
  register_item_id uuid,
  kind             text not null check (kind in ('gap', 'risk', 'loose_end', 'conflict', 'duplicate', 'missing_document', 'missing_reference', 'question', 'control_field')),
  severity         text not null default 'medium' check (severity in ('high', 'medium', 'low')),
  department_code  text check (department_code ~ '^[A-Z]{2,6}$'),
  title            text not null check (length(title) between 3 and 400),
  detail           text check (length(detail) <= 2000),
  mitigation       text check (length(mitigation) <= 1500),
  evidence         text check (length(evidence) <= 400),
  source           text not null default 'ai' check (source in ('ai', 'rule')),
  status           text not null default 'open' check (status in ('open', 'confirmed', 'rejected', 'resolved')),
  decided_by       uuid,
  decided_at       timestamptz,
  decision_note    text check (length(decision_note) <= 1000),
  created_at       timestamptz not null default now(),
  unique (company_id, id),
  foreign key (company_id, document_id) references public.source_documents(company_id, id) on delete cascade,
  foreign key (company_id, analysis_id) references public.document_analyses(company_id, id) on delete cascade,
  foreign key (company_id, register_item_id) references public.register_items(company_id, id),
  foreign key (company_id, decided_by) references public.memberships(company_id, id)
);
create index doc_findings_doc on public.doc_findings (company_id, document_id);
create index doc_findings_analysis on public.doc_findings (company_id, analysis_id);
create index doc_findings_item on public.doc_findings (company_id, register_item_id);
create index doc_findings_decider on public.doc_findings (company_id, decided_by);
create index doc_findings_dept on public.doc_findings (company_id, department_code, status);
create trigger audit_doc_findings after insert or update on public.doc_findings for each row execute function private.audit_row();

create table public.doc_register_links (
  company_id       uuid not null references public.companies(id),
  document_id      uuid not null,
  register_item_id uuid not null,
  coverage         text not null check (coverage in ('full', 'partial')),
  why              text check (length(why) <= 500),
  by_ai            boolean not null default true,
  created_at       timestamptz not null default now(),
  primary key (company_id, document_id, register_item_id),
  foreign key (company_id, document_id) references public.source_documents(company_id, id) on delete cascade,
  foreign key (company_id, register_item_id) references public.register_items(company_id, id) on delete cascade
);
create index doc_register_links_item on public.doc_register_links (company_id, register_item_id);

alter table public.document_analyses enable row level security;
alter table public.doc_processes enable row level security;
alter table public.doc_findings enable row level security;
alter table public.doc_register_links enable row level security;
-- Administrators see everything; stakeholders (Q8) get department-scoped access in a later migration.
create policy document_analyses_read on public.document_analyses for select to authenticated using ((select private.has_permission(company_id, 'org.manage')));
create policy doc_processes_read on public.doc_processes for select to authenticated using ((select private.has_permission(company_id, 'org.manage')));
create policy doc_findings_read on public.doc_findings for select to authenticated using ((select private.has_permission(company_id, 'org.manage')));
create policy doc_register_links_read on public.doc_register_links for select to authenticated using ((select private.has_permission(company_id, 'org.manage')));
revoke all on public.document_analyses, public.doc_processes, public.doc_findings, public.doc_register_links from anon, authenticated;
grant select on public.document_analyses, public.doc_processes, public.doc_findings, public.doc_register_links to authenticated;

-- New AI capability (the prompt itself is registered per company like every other prompt; see bootstrap/documents_setup.sql).
alter table public.ai_runs drop constraint ai_runs_capability_check;
alter table public.ai_runs add constraint ai_runs_capability_check check (capability in ('interview_followup','answer_extraction',
  'process_architect','contradiction_analysis','risk_control_analysis','legal_source_research','document_draft','completeness_review',
  'change_impact','summary','board_turn','blueprint_synthesis','document_analysis'));

/** Claims the next queued rule document of a company for analysis (service role only; used by doc-ai). */
create or replace function public.doc_claim_next(p_company uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v uuid;
begin
  update public.source_documents set analysis_status = 'queued', analysis_error = 'Stopped unexpectedly; retried'
   where company_id = p_company and analysis_status = 'running' and updated_at < now() - interval '10 minutes';
  select id into v from public.source_documents
   where company_id = p_company and category = 'governing' and read_status = 'read' and analysis_status in ('queued', 'waiting_provider')
   order by (analysis_status = 'waiting_provider'), created_at limit 1 for update skip locked;
  if v is not null then update public.source_documents set analysis_status = 'running', analysis_error = null, updated_at = now() where id = v; end if;
  return v;
end $$;
revoke all on function public.doc_claim_next(uuid) from public, anon, authenticated;

/** A person confirms, rejects or resolves a finding (with a note). */
create or replace function public.doc_finding_decide(p_company uuid, p_finding uuid, p_status text, p_note text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare v_me uuid;
begin
  if p_status not in ('confirmed', 'rejected', 'resolved', 'open') then raise exception 'PPI_BAD_REQUEST: status' using errcode = 'P0001'; end if;
  if not private.has_permission(p_company, 'org.manage') then raise exception 'PPI_FORBIDDEN: company administrators only' using errcode = '42501'; end if;
  select id into v_me from public.memberships where company_id = p_company and user_id = auth.uid() and status = 'active';
  if p_status = 'rejected' and length(coalesce(trim(p_note), '')) < 5 then raise exception 'PPI_BAD_REQUEST: say why it is wrong' using errcode = 'P0001'; end if;
  update public.doc_findings set status = p_status, decided_by = case when p_status = 'open' then null else v_me end,
    decided_at = case when p_status = 'open' then null else now() end, decision_note = left(p_note, 1000)
   where company_id = p_company and id = p_finding;
  if not found then raise exception 'PPI_NOT_FOUND: finding' using errcode = 'P0002'; end if;
end $$;

/** When every rule document has been analysed: checklist items nothing covers become "missing", each with a finding;
 *  near-identical rule documents are reported as duplicates. Returns counts. Safe to run again. */
create or replace function public.doc_assessment_finalize(p_company uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_pending int;
begin
  if not private.has_permission(p_company, 'org.manage') then raise exception 'PPI_FORBIDDEN: company administrators only' using errcode = '42501'; end if;
  select count(*) into v_pending from public.source_documents
   where company_id = p_company and category = 'governing' and read_status = 'read' and analysis_status in ('queued', 'running', 'waiting_provider');
  if v_pending > 0 then
    raise exception 'PPI_PENDING: % rule document(s) are still waiting for analysis; finish those first', v_pending using errcode = 'P0001';
  end if;
  return private.doc_finalize_core(p_company);
end $$;

create or replace function private.doc_finalize_core(p_company uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_missing int := 0; v_found int; v_partial int; v_dup int := 0;
begin
  -- coverage from links (an item covered fully by any document is found; otherwise partial)
  update public.register_items r set status = case when exists (select 1 from public.doc_register_links l where l.company_id = r.company_id and l.register_item_id = r.id and l.coverage = 'full')
      then 'found' else 'partial' end, evidence_count = (select count(*) from public.doc_register_links l where l.company_id = r.company_id and l.register_item_id = r.id), updated_at = now()
   where r.company_id = p_company and r.status in ('not_assessed', 'missing', 'found', 'partial')
     and exists (select 1 from public.doc_register_links l where l.company_id = r.company_id and l.register_item_id = r.id);
  get diagnostics v_found = row_count;
  update public.register_items r set status = 'missing', evidence_count = 0, updated_at = now()
   where r.company_id = p_company and r.kind = 'document' and r.status = 'not_assessed';
  get diagnostics v_missing = row_count;
  insert into public.doc_findings (company_id, register_item_id, kind, severity, department_code, title, detail, source)
  select r.company_id, r.id, 'missing_document',
         case when coalesce(r.criticality, '') ~* 'critical|high' then 'high' when coalesce(r.criticality, '') ~* 'medium' then 'medium' else 'low' end,
         nullif(split_part(r.code, '-', 1), ''), 'Missing: ' || r.title,
         left(coalesce((select i.data->>'What the document should contain' from public.baseline_items i where i.version_id = r.version_id and i.sheet = 'Department Register' and i.code = r.code), ''), 2000),
         'rule'
    from public.register_items r
   where r.company_id = p_company and r.kind = 'document' and r.status = 'missing'
     and not exists (select 1 from public.doc_findings f where f.company_id = r.company_id and f.register_item_id = r.id and f.kind = 'missing_document');
  select count(*) filter (where status = 'partial') into v_partial from public.register_items where company_id = p_company and kind = 'document';
  -- duplicates: rule documents whose names are the same once dates, versions, copies and person names in brackets are removed
  with n as (
    select id, department_code, file_name,
           lower(regexp_replace(regexp_replace(regexp_replace(regexp_replace(file_name, '\.[a-z0-9]+$', '', 'i'), '\(\d+\)|\ycopy\y|\yv(er)?\.? ?\d+(\.\d+)*\y|\yfinal\y|\yrevised\y|\ymodified\y', '', 'gi'),
             '\d{1,2}[./-]\d{1,2}[./-]\d{2,4}', '', 'g'), '[^a-z]+', ' ', 'gi')) k
      from public.source_documents where company_id = p_company and category = 'governing'),
  g as (select trim(k) k, array_agg(id order by file_name) ids, array_agg(file_name order by file_name) names, max(department_code) dept
          from n where length(trim(k)) >= 6 group by trim(k) having count(*) > 1)
  insert into public.doc_findings (company_id, document_id, kind, severity, department_code, title, detail, mitigation, source)
  select p_company, g.ids[1], 'duplicate', 'medium', g.dept, cardinality(g.ids) || ' versions of the same document', array_to_string(g.names, '; '),
         'Keep one approved version with a version number and an owner; withdraw the others.', 'rule'
    from g where not exists (select 1 from public.doc_findings f where f.company_id = p_company and f.kind = 'duplicate' and f.document_id = g.ids[1]);
  get diagnostics v_dup = row_count;
  return jsonb_build_object('covered', v_found, 'partly_covered', v_partial, 'missing', v_missing, 'duplicate_groups', v_dup);
end $$;

revoke all on function private.doc_finalize_core(uuid) from public, anon, authenticated;
revoke all on function public.doc_finding_decide(uuid, uuid, text, text), public.doc_assessment_finalize(uuid) from public, anon;
grant execute on function public.doc_finding_decide(uuid, uuid, text, text), public.doc_assessment_finalize(uuid) to authenticated;

/** Company admin decides which data an AI provider may receive. Providers that may train on inputs can receive "internal"
 *  data only when the admin records that they accept this (who, when, why — the table's own check enforces it); they never
 *  receive confidential or restricted data. Audited. */
create or replace function public.ai_policy_set(p_company uuid, p_provider text, p_max text, p_reason text, p_accept_training boolean default false) returns text
language plpgsql security definer set search_path = '' as $$
declare v_me uuid; v_train boolean;
begin
  if not private.has_permission(p_company, 'org.manage') then raise exception 'PPI_FORBIDDEN: company administrators only' using errcode = '42501'; end if;
  if p_max not in ('public', 'internal', 'confidential') then raise exception 'PPI_BAD_REQUEST: choose public, internal or confidential' using errcode = 'P0001'; end if;
  if length(coalesce(trim(p_reason), '')) < 20 then raise exception 'PPI_BAD_REQUEST: give a reason (at least 20 characters)' using errcode = 'P0001'; end if;
  select may_train_on_inputs into v_train from public.ai_provider_policies where company_id = p_company and provider = p_provider;
  if v_train is null then raise exception 'PPI_NOT_FOUND: provider policy' using errcode = 'P0002'; end if;
  if v_train and p_max = 'confidential' then
    raise exception 'PPI_AI_POLICY: % may use what it receives to train its models, so it can never receive confidential data', p_provider using errcode = 'P0001';
  end if;
  if v_train and p_max = 'internal' and not p_accept_training then
    raise exception 'PPI_AI_POLICY: % may use what it receives to train its models; tick that you accept this to allow internal data', p_provider using errcode = 'P0001';
  end if;
  select id into v_me from public.memberships where company_id = p_company and user_id = auth.uid() and status = 'active';
  update public.ai_provider_policies set max_classification = p_max, status = 'active',
    training_accepted_by_membership_id = case when v_train and p_max = 'internal' then v_me else training_accepted_by_membership_id end,
    training_accepted_on = case when v_train and p_max = 'internal' then (now() at time zone 'Asia/Kolkata')::date else training_accepted_on end,
    training_acceptance_note = case when v_train and p_max = 'internal' then left(trim(p_reason), 500) else training_acceptance_note end,
    notes = left(coalesce(notes, '') || E'\n' || to_char(now() at time zone 'Asia/Kolkata', 'YYYY-MM-DD') || ': set to ' || p_max || ' — ' || trim(p_reason), 2000)
   where company_id = p_company and provider = p_provider;
  return 'Saved.';
end $$;
revoke all on function public.ai_policy_set(uuid, text, text, text, boolean) from public, anon;
grant execute on function public.ai_policy_set(uuid, text, text, text, boolean) to authenticated;
