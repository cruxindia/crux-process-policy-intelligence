-- PPI-026: the admin switch can turn on the AI-led discovery conversation (preferred) or the adaptive interview.
create or replace function public.set_join_interview_mode(p_company uuid, p_adaptive boolean)
returns text language plpgsql security definer set search_path = '' as $$
declare v_target uuid; v_code text;
begin
  if not (private.is_human_actor(p_company) and private.has_permission(p_company, 'org.manage')) then
    raise exception 'PPI_FORBIDDEN: only administrators can change the interview mode' using errcode = '42501';
  end if;
  select id, code into v_target, v_code from public.interview_campaigns
   where company_id = p_company
     and (case when p_adaptive then interview_mode in ('discovery', 'adaptive') else interview_mode = 'fixed' end)
     and status in ('active', 'draft') and question_scopes is not null
   order by (interview_mode = 'discovery') desc, (status = 'active') desc, created_at desc limit 1;
  if v_target is null then
    raise exception 'PPI_INPUT: no % interview is configured for this company', case when p_adaptive then 'AI' else 'fixed' end
      using errcode = 'P0001';
  end if;
  update public.interview_campaigns set status = 'active' where company_id = p_company and id = v_target and status = 'draft';
  update public.company_join_links set campaign_id = v_target
   where company_id = p_company and status = 'active' and campaign_id is distinct from v_target;
  insert into public.audit_events (company_id, actor_user_id, actor_type, action, object_type, object_id, changed_fields)
  values (p_company, (select auth.uid()), 'user', case when p_adaptive then 'INTERVIEW_MODE_AI' else 'INTERVIEW_MODE_FIXED' end,
          'interview_campaigns', v_target::text, array['company_join_links.campaign_id']);
  return v_code;
end $$;
revoke all on function public.set_join_interview_mode(uuid, boolean) from public, anon;
grant execute on function public.set_join_interview_mode(uuid, boolean) to authenticated;
