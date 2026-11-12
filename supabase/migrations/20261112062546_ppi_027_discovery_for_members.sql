-- PPI-027: every active member gets the company's AI-led discovery conversation — not only people who join after the
-- join link was switched. The member chooses nothing (prompt v2.0: employees never create campaigns or pick templates).
-- Idempotent: one assignment per member per discovery campaign; returns null when the company has no active discovery campaign.
create or replace function public.my_discovery_assignment(p_company uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_mid uuid; v_dept uuid; v_camp uuid; v_camp_dept uuid; v_id uuid;
begin
  v_mid := private.my_membership(p_company);
  if v_mid is null or not private.is_human_actor(p_company) then return null; end if;
  -- The campaign the active join link points to (if it is a discovery one), else the newest active discovery campaign.
  select c.id, c.department_id into v_camp, v_camp_dept
    from public.interview_campaigns c
    left join public.company_join_links l on l.company_id = c.company_id and l.campaign_id = c.id and l.status = 'active'
   where c.company_id = p_company and c.interview_mode = 'discovery' and c.status = 'active'
   order by (l.id is not null) desc, c.created_at desc limit 1;
  if v_camp is null then return null; end if;
  select id into v_id from public.interview_assignments
   where company_id = p_company and campaign_id = v_camp and respondent_membership_id = v_mid
   order by created_at limit 1;
  if v_id is not null then return v_id; end if;
  select primary_department_id into v_dept from public.memberships where id = v_mid;
  insert into public.interview_assignments (company_id, campaign_id, respondent_membership_id, department_id)
  values (p_company, v_camp, v_mid, coalesce(v_dept, v_camp_dept))
  on conflict do nothing
  returning id into v_id;
  if v_id is null then  -- lost a race with a parallel request
    select id into v_id from public.interview_assignments
     where company_id = p_company and campaign_id = v_camp and respondent_membership_id = v_mid order by created_at limit 1;
  else
    insert into public.audit_events (company_id, actor_user_id, actor_type, action, object_type, object_id, changed_fields)
    values (p_company, (select auth.uid()), 'user', 'DISCOVERY_ASSIGNED', 'interview_assignments', v_id::text, array['created for existing member']);
  end if;
  return v_id;
end $$;
revoke all on function public.my_discovery_assignment(uuid) from public, anon;
grant execute on function public.my_discovery_assignment(uuid) to authenticated;
