-- PPI-017 A respondent may read the campaign(s) they are assigned to (name, purpose, due date), nothing else.
create or replace function private.is_campaign_respondent(p_company uuid, p_campaign uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.interview_assignments a
                  where a.company_id = p_company and a.campaign_id = p_campaign
                    and a.respondent_membership_id = private.my_membership(p_company))
$$;
revoke all on function private.is_campaign_respondent(uuid, uuid) from public, anon;
grant execute on function private.is_campaign_respondent(uuid, uuid) to authenticated, service_role;

drop policy ic_read on public.interview_campaigns;
create policy ic_read on public.interview_campaigns for select to authenticated
  using ((select private.has_permission(company_id, 'interview.manage', department_id, process_id))
      or (select private.has_permission(company_id, 'interview.review', department_id, process_id))
      or (select private.is_campaign_respondent(company_id, id)));
