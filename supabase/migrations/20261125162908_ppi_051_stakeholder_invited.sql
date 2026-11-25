-- PPI-051: a person invited from the stakeholder form (membership status 'invited' until first sign-in) can be named a
-- department stakeholder straight away. Found by the hosted documents E2E (25-Nov-2026): doc_stakeholder_add accepted
-- only 'active' memberships, so "invite + name as stakeholder" failed with "person".
create or replace function public.doc_stakeholder_add(p_company uuid, p_dept text, p_membership uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not private.has_permission(p_company, 'org.manage') then raise exception 'PPI_FORBIDDEN: company administrators only' using errcode = '42501'; end if;
  if not exists (select 1 from public.memberships where company_id = p_company and id = p_membership and status in ('active', 'invited')) then
    raise exception 'PPI_NOT_FOUND: this person is not an active or invited member of the company' using errcode = 'P0002';
  end if;
  insert into public.doc_stakeholders (company_id, department_code, membership_id, added_by)
  values (p_company, upper(p_dept), p_membership, private.my_membership(p_company)) on conflict do nothing;
end $$;
