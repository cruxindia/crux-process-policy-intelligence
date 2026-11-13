-- PPI-033: M3 interview upgrade (blueprint §6, §9; decisions D-084…D-088).
--  * up to 3 suggested answers stored with each AI question; an answer taken from a suggestion is marked as such;
--  * "Save for later" = answer kind 'deferred'; "Not applicable" needs a reason (new answers only — older rows are kept as they are);
--  * "Ask a colleague": a clarification request linked to the interview question; the reply is fed back to the interviewer;
--  * department-head validation of the ONE company process (catalogue item) with a snapshot of the sources, stale detection
--    and maker-checker (nobody validates a process only they described).

-- 1. Suggestions and answer options --------------------------------------------------------------------------------------
alter table public.interview_questions add column suggestions text[] not null default '{}'
  check (cardinality(suggestions) <= 3);
alter table public.interview_answers add column from_suggestion boolean not null default false;
alter table public.interview_answers drop constraint interview_answers_answer_kind_check;
alter table public.interview_answers add constraint interview_answers_answer_kind_check
  check (answer_kind in ('answer','unknown','not_applicable','depends','refer_to_owner','deferred'));
alter table public.interview_answers add constraint interview_answers_na_reason
  check (answer_kind <> 'not_applicable' or coalesce(length(trim(answer_text)),0) > 0) not valid;
alter table public.interview_answers add constraint interview_answers_suggestion_is_answer
  check (not from_suggestion or answer_kind = 'answer');

-- 2. Ask a colleague -----------------------------------------------------------------------------------------------------
create table public.interview_help_requests (
  id                      uuid not null default gen_random_uuid(),
  company_id              uuid not null references public.companies(id),
  session_id              uuid not null,
  question_id             uuid not null,
  task_id                 uuid not null,
  requester_membership_id uuid not null,
  helper_membership_id    uuid not null,
  created_at              timestamptz not null default now(),
  primary key (id), unique (company_id, id),
  unique (company_id, question_id, helper_membership_id),
  foreign key (company_id, session_id) references public.interview_sessions(company_id, id),
  foreign key (company_id, question_id) references public.interview_questions(company_id, id),
  foreign key (company_id, task_id) references public.clarification_tasks(company_id, id),
  foreign key (company_id, requester_membership_id) references public.memberships(company_id, id),
  foreign key (company_id, helper_membership_id) references public.memberships(company_id, id)
);
create index interview_help_session_idx on public.interview_help_requests (company_id, session_id);
create index interview_help_task_idx on public.interview_help_requests (company_id, task_id);
create index interview_help_requester_idx on public.interview_help_requests (company_id, requester_membership_id);
create index interview_help_helper_idx on public.interview_help_requests (company_id, helper_membership_id);
create trigger interview_help_append_only before update or delete on public.interview_help_requests for each row execute function private.forbid_mutation();
create trigger audit_interview_help after insert on public.interview_help_requests for each row execute function private.audit_row();
alter table public.interview_help_requests enable row level security;
create policy interview_help_read on public.interview_help_requests for select to authenticated using (
  (select private.can_read_session(company_id, session_id)) or helper_membership_id = (select private.my_membership(company_id)));
revoke insert, update, delete, truncate, references, trigger on public.interview_help_requests from authenticated, anon;
grant select on public.interview_help_requests to authenticated;

create or replace function public.interview_ask_colleague(p_company uuid, p_question uuid, p_helper uuid, p_note text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_mid uuid := private.my_membership(p_company); q record; v_from uuid; v_to uuid; v_task uuid := gen_random_uuid();
        v_cur uuid; v_role text; v_note text := nullif(left(trim(coalesce(p_note, '')), 500), '');
begin
  if v_mid is null or not private.is_human_actor(p_company) then raise exception 'PPI_FORBIDDEN: people only' using errcode = '42501'; end if;
  select iq.id, iq.session_id, iq.question_text, a.department_id, m.primary_department_id as my_dept into q
    from public.interview_questions iq
    join public.interview_sessions s on s.company_id = iq.company_id and s.id = iq.session_id
    join public.interview_assignments a on a.company_id = s.company_id and a.id = s.assignment_id
    join public.memberships m on m.company_id = a.company_id and m.id = a.respondent_membership_id
   where iq.company_id = p_company and iq.id = p_question;
  if q.id is null or not private.is_session_respondent(p_company, q.session_id) then
    raise exception 'PPI_FORBIDDEN: you can ask a colleague only about your own interview questions' using errcode = '42501'; end if;
  if not private.session_is_open(p_company, q.session_id) then raise exception 'PPI_LIFECYCLE: this interview is closed' using errcode = 'P0001'; end if;
  if p_helper = v_mid then raise exception 'PPI_INPUT: choose a colleague, not yourself' using errcode = 'P0001'; end if;
  select coalesce(m.primary_department_id, q.department_id, q.my_dept), coalesce(nullif(m.job_title, ''), 'colleague') into v_to, v_role
    from public.memberships m where m.company_id = p_company and m.id = p_helper and m.status = 'active' and m.member_kind = 'human';
  if v_to is null then raise exception 'PPI_INPUT: that colleague is not an active member with a department' using errcode = 'P0001'; end if;
  v_from := coalesce(q.department_id, q.my_dept, v_to);
  if exists (select 1 from public.interview_help_requests where company_id = p_company and question_id = p_question and helper_membership_id = p_helper) then
    raise exception 'PPI_INPUT: you already asked this colleague about this question' using errcode = 'P0001'; end if;
  insert into public.clarification_tasks (id, company_id, requester_membership_id, requesting_department_id, assignee_department_id,
     assignee_membership_id, question_text, context_text, priority, status, idempotency_key)
  values (v_task, p_company, v_mid, v_from, v_to, p_helper, 'A colleague asked for your help with an interview question: ' || q.question_text,
     v_note, 'normal', 'assigned', 'interview-help:' || p_question || ':' || p_helper);
  insert into public.interview_help_requests (company_id, session_id, question_id, task_id, requester_membership_id, helper_membership_id)
  values (p_company, q.session_id, p_question, v_task, v_mid, p_helper);
  select id into v_cur from public.interview_answers where company_id = p_company and question_id = p_question order by revision_no desc limit 1;
  insert into public.interview_answers (company_id, question_id, answer_kind, answer_text, knowledge_basis, referred_membership_id, referred_note,
     answered_by_membership_id, supersedes_answer_id, revision_reason)
  values (p_company, p_question, 'refer_to_owner', null, 'direct', p_helper, coalesce(v_note, v_role), v_mid, v_cur,
     case when v_cur is not null then 'Asked a colleague for help' end);
  return v_task;
end $$;
revoke all on function public.interview_ask_colleague(uuid, uuid, uuid, text) from public, anon;
grant execute on function public.interview_ask_colleague(uuid, uuid, uuid, text) to authenticated;

-- Replies from asked colleagues, for whoever may read the interview (the respondent and reviewers in scope).
create or replace function public.interview_help_replies(p_company uuid, p_session uuid)
returns table (question_id uuid, helper_membership_id uuid, helper_role text, task_status text, reply text, replied_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select h.question_id, h.helper_membership_id, coalesce(nullif(m.job_title, ''), 'colleague'), t.status, r.response_text, r.created_at
    from public.interview_help_requests h
    join public.clarification_tasks t on t.company_id = h.company_id and t.id = h.task_id
    join public.memberships m on m.company_id = h.company_id and m.id = h.helper_membership_id
    left join lateral (select response_text, created_at from public.clarification_responses x
                        where x.company_id = h.company_id and x.task_id = h.task_id order by created_at desc limit 1) r on true
   where h.company_id = p_company and h.session_id = p_session and private.can_read_session(p_company, p_session)
   order by h.created_at
$$;
revoke all on function public.interview_help_replies(uuid, uuid) from public, anon;
grant execute on function public.interview_help_replies(uuid, uuid) to authenticated;

-- 3. Department-head validation of the company process -------------------------------------------------------------------
insert into public.permissions (code, description) values
  ('process.validate', 'Validate (or send back) the company version of a process in the owning department, from everyone''s interview descriptions')
on conflict (code) do nothing;
insert into public.role_permissions (company_id, role_id, permission_code)
select r.company_id, r.id, 'process.validate' from public.roles r where r.code in ('DEPT_HEAD', 'PROCESS_OWNER')
on conflict do nothing;

create table public.process_validations (
  id          uuid not null default gen_random_uuid(),
  company_id  uuid not null references public.companies(id),
  item_id     uuid not null,
  decision    text not null check (decision in ('validated', 'changes_requested')),
  note        text check (note is null or length(note) <= 2000),
  open_items  int not null default 0,
  snapshot    jsonb not null,
  decided_by  uuid not null,
  decided_at  timestamptz not null default now(),
  primary key (id), unique (company_id, id),
  foreign key (company_id, item_id) references public.catalogue_items(company_id, id),
  foreign key (company_id, decided_by) references public.memberships(company_id, id),
  check (decision = 'validated' and open_items = 0 or coalesce(length(trim(note)), 0) >= 10)
);
create index process_validations_item_idx on public.process_validations (company_id, item_id, decided_at desc);
create index process_validations_by_idx on public.process_validations (company_id, decided_by);
create trigger process_validations_append_only before update or delete on public.process_validations for each row execute function private.forbid_mutation();
create trigger audit_process_validations after insert on public.process_validations for each row execute function private.audit_row();
alter table public.process_validations enable row level security;
create policy process_validations_read on public.process_validations for select to authenticated using ((select private.my_membership(company_id)) is not null);
revoke insert, update, delete, truncate, references, trigger on public.process_validations from authenticated, anon;
grant select on public.process_validations to authenticated;

-- What a validation covers: every linked interview description and the version of its map.
create or replace function private.catalogue_item_snapshot(p_company uuid, p_item uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('dp', d.id, 'v', d.flow_version) order by d.id), '[]'::jsonb)
    from public.catalogue_item_sources s join public.discovered_processes d on d.company_id = s.company_id and d.id = s.discovered_process_id
   where s.company_id = p_company and s.item_id = p_item
$$;
-- Still open in the conversations behind the item: clarifications, questions saved for later, colleagues not yet replied.
create or replace function private.catalogue_open_items(p_company uuid, p_item uuid) returns int
language sql stable security definer set search_path = '' as $$
  with sess as (select distinct d.session_id from public.catalogue_item_sources s
                  join public.discovered_processes d on d.company_id = s.company_id and d.id = s.discovered_process_id
                 where s.company_id = p_company and s.item_id = p_item)
  select ((select count(*) from public.interview_clarifications c where c.company_id = p_company and c.status = 'open' and c.session_id in (select session_id from sess))
        + (select count(*) from public.interview_current_answers a join public.interview_questions q on q.company_id = a.company_id and q.id = a.question_id
            where a.company_id = p_company and a.answer_kind = 'deferred' and q.session_id in (select session_id from sess))
        + (select count(*) from public.interview_help_requests h join public.clarification_tasks t on t.company_id = h.company_id and t.id = h.task_id
            where h.company_id = p_company and t.status in ('open', 'assigned', 'escalated') and h.session_id in (select session_id from sess)))::int
$$;
revoke all on function private.catalogue_item_snapshot(uuid, uuid), private.catalogue_open_items(uuid, uuid) from public, anon, authenticated;

create or replace function public.process_validate(p_company uuid, p_item uuid, p_decision text, p_note text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_mid uuid := private.my_membership(p_company); v_dept uuid; v_found boolean; v_open int; v_id uuid := gen_random_uuid();
        v_note text := nullif(trim(coalesce(p_note, '')), '');
begin
  if v_mid is null or not private.is_human_actor(p_company) then raise exception 'PPI_FORBIDDEN: people only' using errcode = '42501'; end if;
  select true, f.department_id into v_found, v_dept from public.catalogue_items i
    join public.catalogue_functions f on f.company_id = i.company_id and f.id = i.function_id
   where i.company_id = p_company and i.id = p_item and i.status = 'active';
  if v_found is null then raise exception 'PPI_INPUT: catalogue item not found' using errcode = 'P0001'; end if;
  if not private.has_permission(p_company, 'process.validate', v_dept) then
    raise exception 'PPI_FORBIDDEN: only the department head or process owner of this department can validate it' using errcode = '42501'; end if;
  if p_decision not in ('validated', 'changes_requested') then raise exception 'PPI_INPUT: unknown decision' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.catalogue_item_sources where company_id = p_company and item_id = p_item) then
    raise exception 'PPI_INPUT: nothing to validate yet — no interview description is linked to this item' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.catalogue_item_sources s join public.discovered_processes d on d.company_id = s.company_id and d.id = s.discovered_process_id
                  where s.company_id = p_company and s.item_id = p_item and d.membership_id <> v_mid) then
    raise exception 'PPI_MAKER_CHECKER: only you described this process, so someone else with validation rights must confirm it' using errcode = 'P0001'; end if;
  v_open := private.catalogue_open_items(p_company, p_item);
  if p_decision = 'changes_requested' and coalesce(length(v_note), 0) < 10 then
    raise exception 'PPI_INPUT: say what must change (at least 10 characters)' using errcode = 'P0001'; end if;
  if p_decision = 'validated' and v_open > 0 and coalesce(length(v_note), 0) < 10 then
    raise exception 'PPI_INPUT: % question(s) are still open — add a note explaining why you validate anyway', v_open using errcode = 'P0001'; end if;
  insert into public.process_validations (id, company_id, item_id, decision, note, open_items, snapshot, decided_by)
  values (v_id, p_company, p_item, p_decision, left(v_note, 2000), v_open, private.catalogue_item_snapshot(p_company, p_item), v_mid);
  return v_id;
end $$;
revoke all on function public.process_validate(uuid, uuid, text, text) from public, anon;
grant execute on function public.process_validate(uuid, uuid, text, text) to authenticated;

-- Latest validation per item, with "changed since" (a source was linked/unlinked or a map changed after the decision).
create or replace function public.process_validation_status(p_company uuid)
returns table (item_id uuid, decision text, note text, decided_by uuid, decided_at timestamptz, stale boolean, open_items int)
language sql stable security definer set search_path = '' as $$
  select v.item_id, v.decision, v.note, v.decided_by, v.decided_at,
         v.snapshot is distinct from private.catalogue_item_snapshot(p_company, v.item_id),
         private.catalogue_open_items(p_company, v.item_id)
    from (select distinct on (item_id) * from public.process_validations where company_id = p_company order by item_id, decided_at desc, id) v
   where private.my_membership(p_company) is not null
$$;
revoke all on function public.process_validation_status(uuid) from public, anon;
grant execute on function public.process_validation_status(uuid) to authenticated;

-- Rights for the UI (any department in which the caller may validate).
create or replace function public.process_validate_rights(p_company uuid) returns boolean
language sql stable security definer set search_path = '' as $$ select private.has_permission_anywhere(p_company, 'process.validate') $$;
revoke all on function public.process_validate_rights(uuid) from public, anon;
grant execute on function public.process_validate_rights(uuid) to authenticated;
