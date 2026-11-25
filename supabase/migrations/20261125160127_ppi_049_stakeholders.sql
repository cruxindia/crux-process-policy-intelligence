-- PPI-049: Departments and stakeholders from the documents (SOW 12G Q7/Q8).
-- Departments found in the documents become company departments (matched by code; created when missing). For each department
-- the administrator names the stakeholders who will review what the documents say and be interviewed. A stakeholder sees
-- their department's as-is processes, flowcharts, gaps, loose ends, risks and suggested mitigations, and confirms, corrects
-- or answers each one. Departments without stakeholders are shown to the administrator as open tasks.

create table public.doc_stakeholders (
  company_id      uuid not null references public.companies(id),
  department_code text not null check (department_code ~ '^[A-Z]{2,6}$'),
  membership_id   uuid not null,
  added_by        uuid,
  created_at      timestamptz not null default now(),
  primary key (company_id, department_code, membership_id),
  foreign key (company_id, membership_id) references public.memberships(company_id, id),
  foreign key (company_id, added_by) references public.memberships(company_id, id)
);
create index doc_stakeholders_member on public.doc_stakeholders (company_id, membership_id);
create index doc_stakeholders_added_by on public.doc_stakeholders (company_id, added_by);
create trigger audit_doc_stakeholders after insert or delete on public.doc_stakeholders for each row execute function private.audit_row();

alter table public.doc_stakeholders enable row level security;
create policy doc_stakeholders_read on public.doc_stakeholders for select to authenticated
  using ((select private.has_permission(company_id, 'org.manage')) or membership_id = (select private.my_membership(company_id)));
revoke all on public.doc_stakeholders from anon, authenticated;
grant select on public.doc_stakeholders to authenticated;

/** Is the signed-in person a stakeholder of this department? */
create or replace function private.is_doc_stakeholder(p_company uuid, p_dept text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.doc_stakeholders s where s.company_id = p_company and s.department_code = p_dept
                 and s.membership_id = private.my_membership(p_company))
$$;
revoke all on function private.is_doc_stakeholder(uuid, text) from public, anon;
grant execute on function private.is_doc_stakeholder(uuid, text) to authenticated;

-- Stakeholders read their department's processes and findings (and the names of the documents they come from).
create policy doc_findings_stakeholder on public.doc_findings for select to authenticated
  using (department_code is not null and (select private.is_doc_stakeholder(company_id, department_code)));
create policy doc_processes_stakeholder on public.doc_processes for select to authenticated
  using (department_code is not null and (select private.is_doc_stakeholder(company_id, department_code)));
create policy source_documents_stakeholder on public.source_documents for select to authenticated
  using (category = 'governing' and exists (select 1 from public.doc_processes p where p.company_id = source_documents.company_id and p.document_id = source_documents.id
           and p.department_code is not null and private.is_doc_stakeholder(p.company_id, p.department_code))
      or category = 'governing' and exists (select 1 from public.doc_findings f where f.company_id = source_documents.company_id and f.document_id = source_documents.id
           and f.department_code is not null and private.is_doc_stakeholder(f.company_id, f.department_code)));

/** Departments found in the documents, with counts and stakeholders (administrators). Creates missing company departments
 *  when p_create is true. Returns [{code, department_id, files, rule_documents, open_findings, stakeholders}]. */
create or replace function public.doc_departments(p_company uuid, p_create boolean default false) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_names jsonb := '{"GOV":"Board & Company Secretariat","BE":"Strategy & PMO","OPS":"Operations","HR":"Human Resources","FIN":"Finance & Accounts",
  "BD":"Sales & Business Development","CS":"Client Service","PM":"Partner Management","PROC":"Procurement & Administration","IT":"IT & Data",
  "LRC":"Legal, Compliance & Risk"}'::jsonb;
  v_out jsonb;
begin
  if not private.has_permission(p_company, 'org.manage') then raise exception 'PPI_FORBIDDEN: company administrators only' using errcode = '42501'; end if;
  if p_create then
    insert into public.departments (company_id, code, name)
    select p_company, c.code, v_names->>c.code from (
      select distinct department_code code from public.source_documents where company_id = p_company and department_code is not null
      union select distinct department_code from public.doc_findings where company_id = p_company and department_code is not null) c
    where v_names ? c.code
    on conflict (company_id, code) do nothing;
  end if;
  with codes as (
    select department_code code from public.source_documents where company_id = p_company and department_code is not null
    union select department_code from public.doc_findings where company_id = p_company and department_code is not null
    union select department_code from public.doc_stakeholders where company_id = p_company)
  select coalesce(jsonb_agg(jsonb_build_object(
      'code', c.code, 'name', coalesce(d.name, v_names->>c.code, c.code), 'department_id', d.id,
      'files', (select count(*) from public.source_documents s where s.company_id = p_company and s.department_code = c.code),
      'rule_documents', (select count(*) from public.source_documents s where s.company_id = p_company and s.department_code = c.code and s.category = 'governing'),
      'open_findings', (select count(*) from public.doc_findings f where f.company_id = p_company and f.department_code = c.code and f.status = 'open'),
      'stakeholders', coalesce((select jsonb_agg(jsonb_build_object('membership_id', m.id, 'name', coalesce(up.display_name, 'Unnamed'), 'job_title', m.job_title) order by up.display_name)
          from public.doc_stakeholders st join public.memberships m on m.company_id = st.company_id and m.id = st.membership_id
          left join public.user_profiles up on up.id = m.user_id
         where st.company_id = p_company and st.department_code = c.code), '[]'::jsonb)) order by c.code), '[]'::jsonb)
    into v_out
    from codes c left join public.departments d on d.company_id = p_company and d.code = c.code;
  return v_out;
end $$;

create or replace function public.doc_stakeholder_add(p_company uuid, p_dept text, p_membership uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not private.has_permission(p_company, 'org.manage') then raise exception 'PPI_FORBIDDEN: company administrators only' using errcode = '42501'; end if;
  if not exists (select 1 from public.memberships where company_id = p_company and id = p_membership and status = 'active') then
    raise exception 'PPI_NOT_FOUND: person' using errcode = 'P0002';
  end if;
  insert into public.doc_stakeholders (company_id, department_code, membership_id, added_by)
  values (p_company, upper(p_dept), p_membership, private.my_membership(p_company)) on conflict do nothing;
end $$;

create or replace function public.doc_stakeholder_remove(p_company uuid, p_dept text, p_membership uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not private.has_permission(p_company, 'org.manage') then raise exception 'PPI_FORBIDDEN: company administrators only' using errcode = '42501'; end if;
  delete from public.doc_stakeholders where company_id = p_company and department_code = upper(p_dept) and membership_id = p_membership;
end $$;

/** My review areas (stakeholders): departments I review with counts. */
create or replace function public.my_doc_reviews(p_company uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('code', s.department_code, 'name', coalesce(d.name, s.department_code),
           'open', (select count(*) from public.doc_findings f where f.company_id = s.company_id and f.department_code = s.department_code and f.status = 'open'),
           'decided', (select count(*) from public.doc_findings f where f.company_id = s.company_id and f.department_code = s.department_code and f.status <> 'open'),
           'processes', (select count(*) from public.doc_processes p where p.company_id = s.company_id and p.department_code = s.department_code))
         order by s.department_code), '[]'::jsonb)
    from public.doc_stakeholders s left join public.departments d on d.company_id = s.company_id and d.code = s.department_code
   where s.company_id = p_company and s.membership_id = private.my_membership(p_company)
$$;

-- Stakeholders may decide findings of their department (same rules as administrators).
create or replace function public.doc_finding_decide(p_company uuid, p_finding uuid, p_status text, p_note text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare v_me uuid; v_dept text;
begin
  if p_status not in ('confirmed', 'rejected', 'resolved', 'open') then raise exception 'PPI_BAD_REQUEST: status' using errcode = 'P0001'; end if;
  select department_code into v_dept from public.doc_findings where company_id = p_company and id = p_finding;
  if not found then raise exception 'PPI_NOT_FOUND: finding' using errcode = 'P0002'; end if;
  if not (private.has_permission(p_company, 'org.manage') or (v_dept is not null and private.is_doc_stakeholder(p_company, v_dept))) then
    raise exception 'PPI_FORBIDDEN: only administrators and this department''s stakeholders decide findings' using errcode = '42501';
  end if;
  v_me := private.my_membership(p_company);
  if p_status = 'rejected' and length(coalesce(trim(p_note), '')) < 5 then raise exception 'PPI_BAD_REQUEST: say why it is wrong' using errcode = 'P0001'; end if;
  update public.doc_findings set status = p_status, decided_by = case when p_status = 'open' then null else v_me end,
    decided_at = case when p_status = 'open' then null else now() end, decision_note = left(p_note, 1000)
   where company_id = p_company and id = p_finding;
end $$;

revoke all on function public.doc_departments(uuid, boolean), public.doc_stakeholder_add(uuid, text, uuid), public.doc_stakeholder_remove(uuid, text, uuid),
  public.my_doc_reviews(uuid) from public, anon;
grant execute on function public.doc_departments(uuid, boolean), public.doc_stakeholder_add(uuid, text, uuid), public.doc_stakeholder_remove(uuid, text, uuid),
  public.my_doc_reviews(uuid) to authenticated;
