-- PPI-035: blueprint §6B — "I don't know" creates a knowledge gap. Answers still "I'm not sure" in the conversations behind a
-- company process now count as open items for department-head validation (and are listed on the item page).
create or replace function private.catalogue_open_items(p_company uuid, p_item uuid) returns int
language sql stable security definer set search_path = '' as $$
  with sess as (select distinct d.session_id from public.catalogue_item_sources s
                  join public.discovered_processes d on d.company_id = s.company_id and d.id = s.discovered_process_id
                 where s.company_id = p_company and s.item_id = p_item)
  select ((select count(*) from public.interview_clarifications c where c.company_id = p_company and c.status = 'open' and c.session_id in (select session_id from sess))
        + (select count(*) from public.interview_current_answers a join public.interview_questions q on q.company_id = a.company_id and q.id = a.question_id
            where a.company_id = p_company and a.answer_kind in ('deferred', 'unknown') and q.session_id in (select session_id from sess))
        + (select count(*) from public.interview_help_requests h join public.clarification_tasks t on t.company_id = h.company_id and t.id = h.task_id
            where h.company_id = p_company and t.status in ('open', 'assigned', 'escalated') and h.session_id in (select session_id from sess)))::int
$$;
revoke all on function private.catalogue_open_items(uuid, uuid) from public, anon, authenticated;
