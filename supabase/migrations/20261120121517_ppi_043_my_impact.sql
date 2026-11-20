-- PPI-043: "Your impact" for every member (P7, D-101). Counts only — the person's own contribution and the company's
-- shared progress — so everyone sees what their effort built. No names of others, no content.
create or replace function public.my_impact(p_company uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_me uuid := private.my_membership(p_company); v_30 timestamptz := now() - interval '30 days'; v_score int; v_rank int; v_contributors int;
begin
  if v_me is null then raise exception 'PPI_FORBIDDEN: not a member' using errcode = '42501'; end if;
  with s as (
    select m.id,
      (select count(*) from public.interview_answers x where x.answered_by_membership_id = m.id and x.answered_at >= v_30)
      + 3 * (select count(*) from public.tickets t where t.assignee_membership_id = m.id and t.resolved_at >= v_30)
      + 2 * (select count(*) from public.clarification_responses cr where cr.responder_membership_id = m.id and cr.created_at >= v_30) score
    from public.memberships m where m.company_id = p_company and m.member_kind = 'human' and m.status = 'active')
  select (select score from s where id = v_me), (select count(*) + 1 from s where score > (select score from s where id = v_me)), (select count(*) from s where score > 0)
    into v_score, v_rank, v_contributors;
  return jsonb_build_object(
    'me', jsonb_build_object(
      'answers', (select count(*) from public.interview_answers x where x.answered_by_membership_id = v_me),
      'answers_30d', (select count(*) from public.interview_answers x where x.answered_by_membership_id = v_me and x.answered_at >= v_30),
      'processes_described', (select count(*) from public.discovered_processes dp where dp.membership_id = v_me and dp.status <> 'removed'),
      'colleagues_helped', (select count(*) from public.clarification_responses cr where cr.responder_membership_id = v_me),
      'tasks_resolved', (select count(*) from public.tickets t where t.assignee_membership_id = v_me and t.status in ('resolved', 'closed')),
      'validations', (select count(*) from public.process_validations pv where pv.decided_by = v_me),
      'interview_done', exists (select 1 from public.interview_assignments a join public.interview_sessions s on s.assignment_id = a.id
                                 where a.respondent_membership_id = v_me and s.submitted_at is not null),
      'score_30d', coalesce(v_score, 0),
      'top5', coalesce(v_score, 0) > 0 and v_rank <= 5,
      'joined', (select created_at from public.memberships where id = v_me)),
    'company', jsonb_build_object(
      'people', (select count(*) from public.memberships m where m.company_id = p_company and m.member_kind = 'human' and m.status = 'active'),
      'contributors_30d', coalesce(v_contributors, 0),
      'processes', (select count(*) from public.catalogue_items ci where ci.company_id = p_company and ci.status <> 'retired'),
      'validated', (select count(distinct pv.item_id) from public.process_validations pv where pv.company_id = p_company and pv.decision = 'validated'),
      'documents', (select count(*) from public.board_cases bc where bc.company_id = p_company and bc.status = 'approved'),
      'interviews_done', (select count(distinct a.respondent_membership_id) from public.interview_assignments a join public.interview_sessions s on s.assignment_id = a.id
                           where a.company_id = p_company and s.submitted_at is not null),
      'interviews_assigned', (select count(distinct a.respondent_membership_id) from public.interview_assignments a
                               where a.company_id = p_company and a.status not in ('cancelled', 'declined', 'expired'))));
end $$;
revoke all on function public.my_impact(uuid) from public, anon;
grant execute on function public.my_impact(uuid) to authenticated;
