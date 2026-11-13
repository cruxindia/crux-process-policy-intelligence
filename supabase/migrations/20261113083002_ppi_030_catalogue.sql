-- PPI-030 (blueprint §5): functional catalogue, enterprise policy catalogue, department SOP and core-process lists.
-- Every item is classified Mandatory / Required / Recommended / Not applicable (or still Unassessed) by a person, with a reason;
-- classes listed in companies.catalogue_settings.approval_required need a second person's approval (maker-checker).
-- A missing document is not a missing process: process status and document status are tracked separately; the gap view says which.
-- The blueprint lists are a starting baseline (private.seed_blueprint_catalogue), not a statement that anything is legally mandatory.

insert into public.permissions (code, description) values
  ('catalogue.manage',  'Maintain the function/policy/SOP/process catalogue and propose classifications'),
  ('catalogue.approve', 'Approve classification changes that need approval (maker-checker)')
on conflict (code) do nothing;

-- Existing tenants: company administrators manage + approve; document approvers approve.
insert into public.role_permissions (company_id, role_id, permission_code)
select distinct rp.company_id, rp.role_id, p.code
  from public.role_permissions rp
  cross join (values ('catalogue.manage'), ('catalogue.approve')) p(code)
 where rp.permission_code = 'org.manage'
on conflict do nothing;
insert into public.role_permissions (company_id, role_id, permission_code)
select distinct rp.company_id, rp.role_id, 'catalogue.approve'
  from public.role_permissions rp where rp.permission_code = 'document.approve'
on conflict do nothing;

alter table public.companies add column catalogue_settings jsonb not null
  default '{"approval_required": ["mandatory", "not_applicable"]}'::jsonb
  check (jsonb_typeof(catalogue_settings -> 'approval_required') = 'array');

create table public.catalogue_functions (
  id             uuid not null default gen_random_uuid(),
  company_id     uuid not null references public.companies(id),
  code           text not null check (code ~ '^[A-Z][A-Z0-9_]{1,15}$'),
  name           text not null check (length(name) between 2 and 120),
  description    text,
  sort_order     smallint not null default 100,
  department_id  uuid,                                  -- the existing department that actually owns this function (many functions -> one department)
  status         text not null default 'active' check (status in ('active', 'retired')),
  source         text not null default 'manual' check (source in ('blueprint', 'manual')),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  primary key (id), unique (company_id, id), unique (company_id, code),
  foreign key (company_id, department_id) references public.departments(company_id, id)
);
create index catalogue_functions_dept_idx on public.catalogue_functions (company_id, department_id);

create table public.catalogue_items (
  id                     uuid not null default gen_random_uuid(),
  company_id             uuid not null references public.companies(id),
  kind                   text not null check (kind in ('policy', 'sop', 'process')),
  code                   text not null check (code ~ '^[A-Z][A-Z0-9_-]{1,31}$'),
  title                  text not null check (length(title) between 3 and 200),
  description            text,
  function_id            uuid not null,
  ownership_note         text,                          -- e.g. the blueprint's "HR / Legal" (several owners are possible)
  source                 text not null default 'manual' check (source in ('blueprint', 'manual', 'ai_suggested')),
  status                 text not null default 'active' check (status in ('proposed', 'active', 'retired')),
  classification         text not null default 'unassessed'
                         check (classification in ('unassessed', 'mandatory', 'required', 'recommended', 'not_applicable')),
  basis                  text check (basis in ('law', 'regulation', 'contract', 'company_decision', 'operational_need', 'improvement', 'not_needed')),
  basis_reference        text,
  classification_reason  text,
  classified_by          uuid,
  classified_at          timestamptz,
  approved_by            uuid,
  process_status         text not null default 'unknown' check (process_status in ('unknown', 'not_performed', 'partial', 'performed')),
  process_note           text,
  document_status        text not null default 'unknown'
                         check (document_status in ('unknown', 'none', 'exists_outside', 'draft', 'in_review', 'approved', 'outdated')),
  document_note          text,
  process_id             uuid,
  discovered_process_id  uuid,
  board_case_id          uuid,
  document_id            uuid,
  status_updated_by      uuid,
  status_updated_at      timestamptz,
  created_by             uuid,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  primary key (id), unique (company_id, id), unique (company_id, kind, code),
  foreign key (company_id, function_id) references public.catalogue_functions(company_id, id),
  foreign key (company_id, process_id) references public.processes(company_id, id),
  foreign key (company_id, discovered_process_id) references public.discovered_processes(company_id, id),
  foreign key (company_id, board_case_id) references public.board_cases(company_id, id),
  foreign key (company_id, document_id) references public.documents(company_id, id),
  check (classification = 'unassessed' or (classification_reason is not null and classified_by is not null))
);
create index catalogue_items_function_idx on public.catalogue_items (company_id, function_id);
create index catalogue_items_process_idx on public.catalogue_items (company_id, process_id);
create index catalogue_items_dproc_idx on public.catalogue_items (company_id, discovered_process_id);
create index catalogue_items_case_idx on public.catalogue_items (company_id, board_case_id);
create index catalogue_items_doc_idx on public.catalogue_items (company_id, document_id);

create table public.catalogue_classification_requests (
  id               uuid not null default gen_random_uuid(),
  company_id       uuid not null references public.companies(id),
  item_id          uuid not null,
  from_class       text not null,
  to_class         text not null check (to_class in ('mandatory', 'required', 'recommended', 'not_applicable', 'unassessed')),
  basis            text,
  basis_reference  text,
  reason           text not null check (length(reason) >= 10),
  requested_by     uuid not null,
  requested_at     timestamptz not null default now(),
  status           text not null check (status in ('pending', 'approved', 'rejected', 'applied')),  -- applied = no approval needed
  decided_by       uuid,
  decided_at       timestamptz,
  decision_note    text,
  primary key (id), unique (company_id, id),
  foreign key (company_id, item_id) references public.catalogue_items(company_id, id)
);
create unique index catalogue_one_pending on public.catalogue_classification_requests (company_id, item_id) where status = 'pending';
create index catalogue_requests_item_idx on public.catalogue_classification_requests (company_id, item_id, requested_at desc);

create trigger catalogue_functions_updated before update on public.catalogue_functions for each row execute function private.set_updated_at();
create trigger catalogue_items_updated before update on public.catalogue_items for each row execute function private.set_updated_at();
create trigger catalogue_functions_no_delete before delete on public.catalogue_functions for each row execute function private.forbid_mutation();
create trigger catalogue_items_no_delete before delete on public.catalogue_items for each row execute function private.forbid_mutation();
create trigger catalogue_requests_no_delete before delete on public.catalogue_classification_requests for each row execute function private.forbid_mutation();
create trigger audit_catalogue_functions after insert or update on public.catalogue_functions for each row execute function private.audit_row();
create trigger audit_catalogue_items after insert or update on public.catalogue_items for each row execute function private.audit_row();
create trigger audit_catalogue_requests after insert or update on public.catalogue_classification_requests for each row execute function private.audit_row();

-- Read: any member of the company (the catalogue is company structure, not interview content). Write: RPCs only.
alter table public.catalogue_functions enable row level security;
alter table public.catalogue_items enable row level security;
alter table public.catalogue_classification_requests enable row level security;
create policy catalogue_functions_read on public.catalogue_functions for select to authenticated using ((select private.my_membership(company_id)) is not null);
create policy catalogue_items_read on public.catalogue_items for select to authenticated using ((select private.my_membership(company_id)) is not null);
create policy catalogue_requests_read on public.catalogue_classification_requests for select to authenticated using ((select private.my_membership(company_id)) is not null);
revoke insert, update, delete, truncate, references, trigger on public.catalogue_functions, public.catalogue_items,
  public.catalogue_classification_requests from authenticated, anon;
grant select on public.catalogue_functions, public.catalogue_items, public.catalogue_classification_requests to authenticated;

-- Gap view: what is missing — the process, its document, or the assessment itself.
create view public.catalogue_gaps with (security_invoker = true) as
select i.*, f.code as function_code, f.name as function_name, f.department_id,
       (select r.to_class from public.catalogue_classification_requests r
         where r.company_id = i.company_id and r.item_id = i.id and r.status = 'pending') as pending_class,
       case
         when i.status <> 'active' then 'inactive'
         when i.classification = 'not_applicable' then 'not_applicable'
         when i.classification = 'unassessed' then 'needs_assessment'
         when i.process_status = 'unknown' then 'unknown'
         when i.process_status = 'not_performed' and i.classification in ('mandatory', 'required') then 'process_gap'
         when i.process_status = 'not_performed' then 'opportunity'
         when i.document_status = 'approved' then 'covered'
         when i.document_status = 'outdated' then 'document_outdated'
         when i.document_status in ('draft', 'in_review') then 'document_in_progress'
         when i.process_status = 'partial' and i.classification in ('mandatory', 'required') then 'process_gap'
         else 'documentation_gap'
       end as gap_type
  from public.catalogue_items i
  join public.catalogue_functions f on f.company_id = i.company_id and f.id = i.function_id;
revoke all on public.catalogue_gaps from authenticated, anon;
grant select on public.catalogue_gaps to authenticated;

-- ---------------------------------------------------------------- RPCs
create or replace function private.catalogue_guard(p_company uuid, p_perm text) returns uuid
language plpgsql stable security definer set search_path = '' as $$
declare v_mid uuid := private.my_membership(p_company);
begin
  if v_mid is null or not private.is_human_actor(p_company) then
    raise exception 'PPI_FORBIDDEN: people only' using errcode = '42501';
  end if;
  if not private.has_permission_anywhere(p_company, p_perm) then
    raise exception 'PPI_FORBIDDEN: you cannot change the catalogue' using errcode = '42501';
  end if;
  return v_mid;
end $$;

create or replace function public.catalogue_save_function(p_company uuid, p_id uuid, p_code text, p_name text, p_description text, p_department uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_code text := upper(trim(coalesce(p_code, '')));
begin
  perform private.catalogue_guard(p_company, 'catalogue.manage');
  if v_code !~ '^[A-Z][A-Z0-9_]{1,15}$' then raise exception 'PPI_INPUT: code must be 2-16 capital letters, digits or _' using errcode = 'P0001'; end if;
  if length(trim(coalesce(p_name, ''))) < 2 then raise exception 'PPI_INPUT: name is required' using errcode = 'P0001'; end if;
  if p_department is not null and not exists (select 1 from public.departments where company_id = p_company and id = p_department) then
    raise exception 'PPI_INPUT: department not found' using errcode = 'P0001';
  end if;
  if p_id is null then
    insert into public.catalogue_functions (company_id, code, name, description, department_id)
    values (p_company, v_code, trim(p_name), nullif(trim(p_description), ''), p_department) returning id into v_id;
  else
    update public.catalogue_functions set code = v_code, name = trim(p_name), description = nullif(trim(p_description), ''), department_id = p_department
     where company_id = p_company and id = p_id returning id into v_id;
    if v_id is null then raise exception 'PPI_INPUT: function not found' using errcode = 'P0001'; end if;
  end if;
  return v_id;
end $$;

create or replace function public.catalogue_save_item(p_company uuid, p_id uuid, p_kind text, p_code text, p_title text,
  p_description text, p_function uuid, p_ownership_note text, p_status text default 'active')
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_mid uuid; v_id uuid; v_code text := upper(trim(coalesce(p_code, '')));
begin
  v_mid := private.catalogue_guard(p_company, 'catalogue.manage');
  if p_kind not in ('policy', 'sop', 'process') then raise exception 'PPI_INPUT: choose policy, SOP or process' using errcode = 'P0001'; end if;
  if v_code !~ '^[A-Z][A-Z0-9_-]{1,31}$' then raise exception 'PPI_INPUT: code must be 2-32 capital letters, digits, - or _' using errcode = 'P0001'; end if;
  if length(trim(coalesce(p_title, ''))) < 3 then raise exception 'PPI_INPUT: title is required' using errcode = 'P0001'; end if;
  if p_status not in ('active', 'retired') then raise exception 'PPI_INPUT: status must be active or retired' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.catalogue_functions where company_id = p_company and id = p_function) then
    raise exception 'PPI_INPUT: function not found' using errcode = 'P0001';
  end if;
  if p_id is null then
    insert into public.catalogue_items (company_id, kind, code, title, description, function_id, ownership_note, source, status, created_by)
    values (p_company, p_kind, v_code, trim(p_title), nullif(trim(p_description), ''), p_function, nullif(trim(p_ownership_note), ''), 'manual', p_status, v_mid)
    returning id into v_id;
  else
    update public.catalogue_items set kind = p_kind, code = v_code, title = trim(p_title), description = nullif(trim(p_description), ''),
           function_id = p_function, ownership_note = nullif(trim(p_ownership_note), ''), status = p_status
     where company_id = p_company and id = p_id returning id into v_id;
    if v_id is null then raise exception 'PPI_INPUT: item not found' using errcode = 'P0001'; end if;
  end if;
  return v_id;
end $$;

-- Classification: a person proposes with a reason; classes in approval_required wait for a different approver.
create or replace function public.catalogue_request_classification(p_company uuid, p_item uuid, p_to text, p_basis text,
  p_reference text, p_reason text)
returns text language plpgsql security definer set search_path = '' as $$
declare v_mid uuid; it record; v_need boolean; v_basis text := nullif(trim(coalesce(p_basis, '')), '');
begin
  v_mid := private.catalogue_guard(p_company, 'catalogue.manage');
  select * into it from public.catalogue_items where company_id = p_company and id = p_item for update;
  if not found then raise exception 'PPI_INPUT: item not found' using errcode = 'P0001'; end if;
  if p_to not in ('mandatory', 'required', 'recommended', 'not_applicable', 'unassessed') then
    raise exception 'PPI_INPUT: choose a classification' using errcode = 'P0001'; end if;
  if p_to = it.classification then raise exception 'PPI_INPUT: it already has that classification' using errcode = 'P0001'; end if;
  if length(trim(coalesce(p_reason, ''))) < 10 then raise exception 'PPI_INPUT: give a reason (at least 10 characters)' using errcode = 'P0001'; end if;
  if v_basis is not null and v_basis not in ('law', 'regulation', 'contract', 'company_decision', 'operational_need', 'improvement', 'not_needed') then
    raise exception 'PPI_INPUT: unknown basis' using errcode = 'P0001'; end if;
  -- Mandatory needs a verified basis (law, regulation, contract or a formally approved company decision) and its reference.
  if p_to = 'mandatory' and (v_basis is null or v_basis not in ('law', 'regulation', 'contract', 'company_decision')
                             or length(trim(coalesce(p_reference, ''))) < 3) then
    raise exception 'PPI_INPUT: mandatory needs its basis (law, regulation, contract or company decision) and a reference' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.catalogue_classification_requests where company_id = p_company and item_id = p_item and status = 'pending') then
    raise exception 'PPI_INPUT: a classification change is already waiting for approval' using errcode = 'P0001';
  end if;
  v_basis := coalesce(v_basis, case p_to when 'required' then 'operational_need' when 'recommended' then 'improvement'
                                         when 'not_applicable' then 'not_needed' else null end);
  select p_to = any (select jsonb_array_elements_text(catalogue_settings -> 'approval_required')) into v_need
    from public.companies where id = p_company;
  insert into public.catalogue_classification_requests (company_id, item_id, from_class, to_class, basis, basis_reference, reason, requested_by, status)
  values (p_company, p_item, it.classification, p_to, v_basis, nullif(trim(p_reference), ''), trim(p_reason), v_mid,
          case when v_need then 'pending' else 'applied' end);
  if not v_need then
    update public.catalogue_items set classification = p_to, basis = case when p_to = 'unassessed' then null else v_basis end,
           basis_reference = nullif(trim(p_reference), ''), classification_reason = case when p_to = 'unassessed' then null else trim(p_reason) end,
           classified_by = case when p_to = 'unassessed' then null else v_mid end, classified_at = now(), approved_by = null
     where company_id = p_company and id = p_item;
    return 'applied';
  end if;
  return 'pending';
end $$;

create or replace function public.catalogue_decide_classification(p_company uuid, p_request uuid, p_decision text, p_note text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare v_mid uuid; r record;
begin
  v_mid := private.catalogue_guard(p_company, 'catalogue.approve');
  select * into r from public.catalogue_classification_requests where company_id = p_company and id = p_request for update;
  if not found or r.status <> 'pending' then raise exception 'PPI_INPUT: this request is not waiting for a decision' using errcode = 'P0001'; end if;
  if r.requested_by = v_mid then raise exception 'PPI_FORBIDDEN: someone else must approve your own request' using errcode = '42501'; end if;
  if p_decision not in ('approved', 'rejected') then raise exception 'PPI_INPUT: approve or reject' using errcode = 'P0001'; end if;
  if p_decision = 'rejected' and length(trim(coalesce(p_note, ''))) < 5 then
    raise exception 'PPI_INPUT: say why it is rejected' using errcode = 'P0001'; end if;
  update public.catalogue_classification_requests set status = p_decision, decided_by = v_mid, decided_at = now(), decision_note = nullif(trim(p_note), '')
   where company_id = p_company and id = p_request;
  if p_decision = 'approved' then
    update public.catalogue_items set classification = r.to_class, basis = r.basis, basis_reference = r.basis_reference,
           classification_reason = r.reason, classified_by = r.requested_by, classified_at = now(), approved_by = v_mid
     where company_id = p_company and id = r.item_id;
  end if;
end $$;

-- Process and document status: catalogue managers, or the department head of the department that owns the function.
create or replace function public.catalogue_set_status(p_company uuid, p_item uuid, p_process_status text, p_process_note text,
  p_document_status text, p_document_note text, p_discovered_process uuid default null, p_process uuid default null)
returns void language plpgsql security definer set search_path = '' as $$
declare v_mid uuid := private.my_membership(p_company); v_dept uuid;
begin
  if v_mid is null or not private.is_human_actor(p_company) then raise exception 'PPI_FORBIDDEN: people only' using errcode = '42501'; end if;
  select f.department_id into v_dept from public.catalogue_items i join public.catalogue_functions f on f.company_id = i.company_id and f.id = i.function_id
   where i.company_id = p_company and i.id = p_item;
  if not found then raise exception 'PPI_INPUT: item not found' using errcode = 'P0001'; end if;
  if not (private.has_permission_anywhere(p_company, 'catalogue.manage')
          or (v_dept is not null and private.has_permission(p_company, 'process.edit', v_dept))) then
    raise exception 'PPI_FORBIDDEN: only catalogue managers or the owning department can update this' using errcode = '42501';
  end if;
  if p_process_status not in ('unknown', 'not_performed', 'partial', 'performed')
     or p_document_status not in ('unknown', 'none', 'exists_outside', 'draft', 'in_review', 'approved', 'outdated') then
    raise exception 'PPI_INPUT: unknown status' using errcode = 'P0001'; end if;
  if p_discovered_process is not null and not exists (select 1 from public.discovered_processes where company_id = p_company and id = p_discovered_process) then
    raise exception 'PPI_INPUT: discovered process not found' using errcode = 'P0001'; end if;
  if p_process is not null and not exists (select 1 from public.processes where company_id = p_company and id = p_process) then
    raise exception 'PPI_INPUT: catalogue process not found' using errcode = 'P0001'; end if;
  update public.catalogue_items set process_status = p_process_status, process_note = nullif(trim(p_process_note), ''),
         document_status = p_document_status, document_note = nullif(trim(p_document_note), ''),
         discovered_process_id = coalesce(p_discovered_process, discovered_process_id), process_id = coalesce(p_process, process_id),
         status_updated_by = v_mid, status_updated_at = now()
   where company_id = p_company and id = p_item;
end $$;

-- A drafting case opened from the catalogue is linked back to the item; an unknown/absent document becomes "draft".
create or replace function public.catalogue_link_case(p_company uuid, p_item uuid, p_case uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_mid uuid := private.my_membership(p_company);
begin
  if v_mid is null or not private.is_human_actor(p_company) then raise exception 'PPI_FORBIDDEN: people only' using errcode = '42501'; end if;
  if not exists (select 1 from public.board_cases where company_id = p_company and id = p_case and created_by_membership_id = v_mid) then
    raise exception 'PPI_INPUT: case not found' using errcode = 'P0001'; end if;
  update public.catalogue_items set board_case_id = p_case,
         document_status = case when document_status in ('unknown', 'none') then 'draft' else document_status end,
         status_updated_by = v_mid, status_updated_at = now()
   where company_id = p_company and id = p_item;
  if not found then raise exception 'PPI_INPUT: item not found' using errcode = 'P0001'; end if;
end $$;

revoke all on function private.catalogue_guard(uuid, text) from public, anon, authenticated;
revoke all on function public.catalogue_save_function(uuid, uuid, text, text, text, uuid) from public, anon;
revoke all on function public.catalogue_save_item(uuid, uuid, text, text, text, text, uuid, text, text) from public, anon;
revoke all on function public.catalogue_request_classification(uuid, uuid, text, text, text, text) from public, anon;
revoke all on function public.catalogue_decide_classification(uuid, uuid, text, text) from public, anon;
revoke all on function public.catalogue_set_status(uuid, uuid, text, text, text, text, uuid, uuid) from public, anon;
revoke all on function public.catalogue_link_case(uuid, uuid, uuid) from public, anon;
grant execute on function public.catalogue_save_function(uuid, uuid, text, text, text, uuid) to authenticated;
grant execute on function public.catalogue_save_item(uuid, uuid, text, text, text, text, uuid, text, text) to authenticated;
grant execute on function public.catalogue_request_classification(uuid, uuid, text, text, text, text) to authenticated;
grant execute on function public.catalogue_decide_classification(uuid, uuid, text, text) to authenticated;
grant execute on function public.catalogue_set_status(uuid, uuid, text, text, text, text, uuid, uuid) to authenticated;
grant execute on function public.catalogue_link_case(uuid, uuid, uuid) to authenticated;

-- ---------------------------------------------------------------- blueprint baseline (data, idempotent, all Unassessed)
create or replace function private.seed_blueprint_catalogue(p_company uuid) returns int
language plpgsql security definer set search_path = '' as $$
declare v_n int := 0; r record; p record; f record; i int;
begin
  for r in select * from (values
    (1,  'GOV',     'Board & Corporate Governance',        'Strategy|Delegation of authority|Approvals|Board governance|Management reviews'),
    (2,  'OPS',     'Operations Management',               'Case allocation|Capacity planning|SLA management|Operational reporting|Escalations'),
    (3,  'BD',      'Business Development & Sales',        'Lead management|Proposals|Pricing|Client acquisition|Business forecasting'),
    (4,  'CRM',     'Client Relationship Management',      'Client onboarding|Service agreements|Client reviews|Complaints|Relationship governance'),
    (5,  'FIELD',   'Field Operations',                    'Field allocation|Visits|Inspections|Verification|Evidence collection|Field reporting'),
    (6,  'BACKOFF', 'Back Office & Case Processing',       'Case registration|Document checks|Case processing|Quality checks|Report submission'),
    (7,  'MSME',    'MSME Business',                       'MSME lead generation|MSME business development|MSME case intake|MSME allocation|MSME processing|MSME monitoring'),
    (8,  'FIN',     'Finance & Accounts',                  'Billing|Collections|Payables|Receivables|Reconciliation|Tax|Budgeting|Financial controls'),
    (9,  'HR',      'HR & People Management',              'Recruitment|Onboarding|Attendance|Leave|Payroll inputs|Performance|Training|Exit'),
    (10, 'LEGAL',   'Legal & Compliance',                  'Contracts|Legal notices|Statutory compliance|Obligation tracking|Regulatory updates'),
    (11, 'QBE',     'Quality & Business Excellence',       'SOP governance|Audits|Root-cause analysis|Corrective and preventive action|Process improvement|KPI monitoring'),
    (12, 'IT',      'IT & Digital Transformation',         'Application management|User access|Automation|System changes|Backups|IT support'),
    (13, 'INFOSEC', 'Information Security & Data Privacy', 'Data classification|Confidentiality|Access control|Retention|Security incident management'),
    (14, 'VENDOR',  'Vendor & Partner Management',         'Due diligence|Partner onboarding|Partner agreements|Partner allocation|Partner monitoring|Partner payments|Partner offboarding'),
    (15, 'ADMIN',   'Administration & Branch Management',  'Branch operations|Assets|Facilities|Local administration|Records|Branch governance'),
    (16, 'RISK',    'Risk Management & Internal Audit',    'Enterprise risk|Control testing|Independent audits|Issue tracking|Remediation')) v(n, code, name, procs)
  loop
    insert into public.catalogue_functions (company_id, code, name, sort_order, source) values (p_company, r.code, r.name, r.n * 10, 'blueprint')
    on conflict (company_id, code) do nothing;
    select id into f from public.catalogue_functions where company_id = p_company and code = r.code;
    i := 0;
    for p in select t, ord from unnest(string_to_array(r.procs, '|')) with ordinality u(t, ord) loop
      insert into public.catalogue_items (company_id, kind, code, title, function_id, source)
      values (p_company, 'process', r.code || '-P' || lpad(p.ord::text, 2, '0'), p.t, f.id, 'blueprint') on conflict do nothing;
      get diagnostics i = row_count; v_n := v_n + i;
    end loop;
  end loop;
  for r in select * from (values
    ('POL-01', 'Company Constitution / Governance Framework', 'GOV', 'Board / Management'),
    ('POL-02', 'Delegation of Authority & Approval Matrix', 'GOV', 'Management / Finance'),
    ('POL-03', 'Code of Conduct & Ethics', 'HR', 'HR / Legal'),
    ('POL-04', 'Conflict of Interest Policy', 'LEGAL', 'Management / Legal'),
    ('POL-05', 'Anti-Bribery, Gifts & Entertainment Policy', 'LEGAL', 'Legal / Compliance'),
    ('POL-06', 'Whistleblower / Vigil Mechanism Policy', 'GOV', 'Board / Compliance'),
    ('POL-07', 'Employee Handbook', 'HR', 'HR'),
    ('POL-08', 'Recruitment & Background Verification Policy', 'HR', 'HR'),
    ('POL-09', 'Attendance, Leave & Working Hours Policy', 'HR', 'HR'),
    ('POL-10', 'Performance Management & Disciplinary Policy', 'HR', 'HR'),
    ('POL-11', 'POSH Policy and related procedures (where applicable)', 'HR', 'HR / Internal Committee'),
    ('POL-12', 'Financial Controls & Authority Policy', 'FIN', 'Finance'),
    ('POL-13', 'Procurement & Vendor Management Policy', 'FIN', 'Finance / Operations'),
    ('POL-14', 'Information Security Policy', 'INFOSEC', 'IT / Management'),
    ('POL-15', 'Data Privacy & Personal Data Handling Policy', 'LEGAL', 'Legal / IT'),
    ('POL-16', 'Confidentiality & Client Data Protection Policy', 'LEGAL', 'Legal / Operations'),
    ('POL-17', 'Record Retention & Document Control Policy', 'LEGAL', 'Compliance / Operations'),
    ('POL-18', 'Business Continuity & Disaster Recovery Policy', 'IT', 'IT / Operations'),
    ('POL-19', 'Incident & Crisis Management Policy', 'OPS', 'Operations / Risk'),
    ('POL-20', 'Enterprise Risk Management Policy', 'RISK', 'Management / Risk'),
    ('POL-21', 'Internal Audit & Quality Assurance Policy', 'QBE', 'Quality / Audit'),
    ('POL-22', 'Customer / Client Grievance Management Policy', 'CRM', 'Client Management'),
    ('POL-23', 'Outsourcing & Third-Party Risk Management Policy', 'VENDOR', 'Operations / Legal'),
    ('SOP-OPS-01', 'Case receipt and registration', 'OPS', null), ('SOP-OPS-02', 'Case allocation and reassignment', 'OPS', null),
    ('SOP-OPS-03', 'Field visit planning', 'OPS', null), ('SOP-OPS-04', 'Verification and inspection', 'OPS', null),
    ('SOP-OPS-05', 'Evidence and document collection', 'OPS', null), ('SOP-OPS-06', 'Report preparation', 'OPS', null),
    ('SOP-OPS-07', 'Quality checks and rejection', 'OPS', null), ('SOP-OPS-08', 'Client submission', 'OPS', null),
    ('SOP-OPS-09', 'TAT monitoring', 'OPS', null), ('SOP-OPS-10', 'Pending case management', 'OPS', null),
    ('SOP-OPS-11', 'Escalations and exceptions', 'OPS', null), ('SOP-OPS-12', 'Rework and complaint resolution', 'OPS', null),
    ('SOP-OPS-13', 'Case closure and record retention', 'OPS', null),
    ('SOP-HR-01', 'Recruitment', 'HR', null), ('SOP-HR-02', 'Joining', 'HR', null), ('SOP-HR-03', 'Transfers', 'HR', null),
    ('SOP-HR-04', 'Attendance', 'HR', null), ('SOP-HR-05', 'Payroll inputs', 'HR', null), ('SOP-HR-06', 'Performance management', 'HR', null),
    ('SOP-HR-07', 'Performance improvement plan (PIP)', 'HR', null), ('SOP-HR-08', 'Training', 'HR', null),
    ('SOP-HR-09', 'Employee grievances', 'HR', null), ('SOP-HR-10', 'Exit', 'HR', null),
    ('SOP-FIN-01', 'Billing', 'FIN', null), ('SOP-FIN-02', 'Client collections', 'FIN', null), ('SOP-FIN-03', 'Partner payments', 'FIN', null),
    ('SOP-FIN-04', 'Expense approval', 'FIN', null), ('SOP-FIN-05', 'Reimbursement', 'FIN', null), ('SOP-FIN-06', 'Bank reconciliation', 'FIN', null),
    ('SOP-FIN-07', 'Tax compliance', 'FIN', null), ('SOP-FIN-08', 'Financial reporting', 'FIN', null),
    ('SOP-FIN-09', 'Employee advances and loans', 'FIN', null)) v(code, title, fcode, owner)
  loop
    insert into public.catalogue_items (company_id, kind, code, title, function_id, ownership_note, source)
    select p_company, case when r.code like 'POL-%' then 'policy' else 'sop' end, r.code, r.title, fn.id, r.owner, 'blueprint'
      from public.catalogue_functions fn where fn.company_id = p_company and fn.code = r.fcode
    on conflict do nothing;
    get diagnostics i = row_count; v_n := v_n + i;
  end loop;
  return v_n;
end $$;
revoke all on function private.seed_blueprint_catalogue(uuid) from public, anon, authenticated;
