-- PPI-005 Interview engine data (FR-05, FR-06). Assignment status ≠ session status (C-05).
-- Employee answers are append-only; a correction is a new revision linked to the one it supersedes (AC-01).

create table public.question_templates (
  id            uuid not null default gen_random_uuid() primary key,
  company_id    uuid not null references public.companies(id),
  code          text not null,
  version       int  not null default 1 check (version > 0),
  scope_type    text not null check (scope_type in ('company_dna','department','process','policy','voc','general')),
  field_key     text not null,                  -- structured field this question fills (e.g. process.trigger)
  question_text text not null,
  help_text     text,
  answer_type   text not null default 'text' check (answer_type in ('text','number','choice','multi_choice','date','yes_no','person','department')),
  choices       jsonb,
  branch_rules  jsonb not null default '[]'::jsonb,   -- [{ "when": {...}, "ask": "<code>" }]
  status        text not null default 'draft' check (status in ('draft','active','retired')),
  created_at    timestamptz not null default now(),
  unique (company_id, id),
  unique (company_id, code, version)
);

create table public.interview_campaigns (
  id                  uuid not null default gen_random_uuid() primary key,
  company_id          uuid not null references public.companies(id),
  code                text not null,
  name                text not null,
  purpose             text,
  department_id       uuid,
  process_id          uuid,
  owner_membership_id uuid not null,
  status              text not null default 'draft' check (status in ('draft','active','closed','cancelled')),
  starts_on           date,
  due_on              date,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (company_id, id),
  unique (company_id, code),
  foreign key (company_id, department_id) references public.departments(company_id, id),
  foreign key (company_id, process_id) references public.processes(company_id, id),
  foreign key (company_id, owner_membership_id) references public.memberships(company_id, id),
  check (due_on is null or starts_on is null or due_on >= starts_on)
);

create table public.interview_assignments (
  id                       uuid not null default gen_random_uuid() primary key,
  company_id               uuid not null,
  campaign_id              uuid not null,
  respondent_membership_id uuid not null,
  department_id            uuid not null,
  process_id               uuid,
  status                   text not null default 'invited'
                           check (status in ('invited','accepted','declined','in_progress','completed','expired','cancelled')),
  due_on                   date,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  unique (company_id, id),
  unique nulls not distinct (company_id, campaign_id, respondent_membership_id, department_id, process_id),
  foreign key (company_id, campaign_id) references public.interview_campaigns(company_id, id),
  foreign key (company_id, respondent_membership_id) references public.memberships(company_id, id),
  foreign key (company_id, department_id) references public.departments(company_id, id),
  foreign key (company_id, process_id) references public.processes(company_id, id)
);
create index interview_assignments_respondent_idx on public.interview_assignments (company_id, respondent_membership_id);

create table public.interview_sessions (
  id                    uuid not null default gen_random_uuid() primary key,
  company_id            uuid not null,
  assignment_id         uuid not null,
  status                text not null default 'in_progress'
                        check (status in ('in_progress','submitted','review_pending','reviewed','closed','reopened')),
  started_at            timestamptz not null default now(),
  submitted_at          timestamptz,
  respondent_confirmed_at timestamptz,
  reviewed_by_membership_id uuid,
  reviewed_at           timestamptz,
  updated_at            timestamptz not null default now(),
  unique (company_id, id),
  foreign key (company_id, assignment_id) references public.interview_assignments(company_id, id),
  foreign key (company_id, reviewed_by_membership_id) references public.memberships(company_id, id)
);
create unique index interview_sessions_one_open on public.interview_sessions (company_id, assignment_id)
  where status in ('in_progress','reopened');

-- Each question actually asked in a session, with why it was asked and how it was generated.
create table public.interview_questions (
  id                 uuid not null default gen_random_uuid() primary key,
  company_id         uuid not null,
  session_id         uuid not null,
  seq                int  not null check (seq > 0),
  template_id        uuid,
  parent_question_id uuid,                 -- follow-up chain
  field_key          text not null,
  question_text      text not null,
  rationale          text,                 -- why the engine asked it
  generated_by       text not null check (generated_by in ('template','branch_rule','ai','reviewer')),
  prompt_version_id  uuid,                 -- FK added in PPI-010
  ai_run_id          uuid,                 -- FK added in PPI-010
  created_at         timestamptz not null default now(),
  unique (company_id, id),
  unique (company_id, session_id, seq),
  foreign key (company_id, session_id) references public.interview_sessions(company_id, id),
  foreign key (company_id, template_id) references public.question_templates(company_id, id),
  foreign key (company_id, parent_question_id) references public.interview_questions(company_id, id),
  check (generated_by <> 'ai' or ai_run_id is not null)
);
create trigger interview_questions_append_only before update or delete on public.interview_questions
  for each row execute function private.forbid_mutation();

-- Autosave scratchpad (mutable, owner-only). Not knowledge; never cited as a source.
create table public.interview_answer_drafts (
  company_id   uuid not null,
  question_id  uuid not null,
  draft_text   text,
  updated_at   timestamptz not null default now(),
  primary key (company_id, question_id),
  foreign key (company_id, question_id) references public.interview_questions(company_id, id) on delete cascade
);

create table public.interview_answers (
  id                   uuid not null default gen_random_uuid() primary key,
  company_id           uuid not null,
  question_id          uuid not null,
  revision_no          int  not null default 1 check (revision_no > 0),
  supersedes_answer_id uuid,
  answer_kind          text not null default 'answer'
                       check (answer_kind in ('answer','unknown','not_applicable','depends','refer_to_owner')),
  answer_text          text,
  knowledge_basis      text not null default 'direct'
                       check (knowledge_basis in ('direct','hearsay','assumed','documented')),
  referred_membership_id uuid,
  referred_note        text,
  answered_by_membership_id uuid not null,
  revision_reason      text,
  answered_at          timestamptz not null default now(),
  unique (company_id, id),
  unique (company_id, question_id, revision_no),
  foreign key (company_id, question_id) references public.interview_questions(company_id, id),
  foreign key (company_id, supersedes_answer_id) references public.interview_answers(company_id, id),
  foreign key (company_id, referred_membership_id) references public.memberships(company_id, id),
  foreign key (company_id, answered_by_membership_id) references public.memberships(company_id, id),
  check (answer_kind <> 'answer' or coalesce(length(trim(answer_text)),0) > 0),
  check (answer_kind <> 'refer_to_owner' or referred_membership_id is not null or coalesce(length(trim(referred_note)),0) > 0),
  check ((revision_no = 1) = (supersedes_answer_id is null)),
  check (revision_no = 1 or coalesce(length(trim(revision_reason)),0) > 0)
);
create trigger interview_answers_append_only before update or delete on public.interview_answers
  for each row execute function private.forbid_mutation();

-- Revision guard: a revision must supersede the latest revision of the same question.
create or replace function private.interview_answer_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_latest record;
begin
  select id, revision_no into v_latest from public.interview_answers
   where company_id = new.company_id and question_id = new.question_id
   order by revision_no desc limit 1;
  if v_latest.id is null then
    if new.supersedes_answer_id is not null then
      raise exception 'PPI_REVISION: first answer cannot supersede another' using errcode = 'P0001';
    end if;
    new.revision_no := 1;
  else
    if new.supersedes_answer_id is distinct from v_latest.id then
      raise exception 'PPI_REVISION: revision must supersede the latest answer (%)', v_latest.id using errcode = 'P0001';
    end if;
    new.revision_no := v_latest.revision_no + 1;
  end if;
  return new;
end $$;
create trigger interview_answers_guard before insert on public.interview_answers
  for each row execute function private.interview_answer_guard();

create view public.interview_current_answers with (security_invoker = true) as
select distinct on (a.company_id, a.question_id) a.*
  from public.interview_answers a
 order by a.company_id, a.question_id, a.revision_no desc;

-- Session status machine.
create or replace function private.interview_session_guard() returns trigger
language plpgsql set search_path = '' as $$
begin
  perform private.assert_transition('interview_session', old.status, new.status, array[
    'in_progress>submitted','reopened>submitted','submitted>review_pending','review_pending>reviewed',
    'review_pending>reopened','reviewed>closed','reviewed>reopened','submitted>reopened']);
  if new.status = 'submitted' and old.status <> 'submitted' then new.submitted_at := now(); end if;
  if new.status = 'reviewed' and old.status <> 'reviewed' then
    if not private.is_human_actor(new.company_id) then
      raise exception 'PPI_HUMAN_ONLY: interview review requires a human reviewer' using errcode = 'P0001';
    end if;
    new.reviewed_by_membership_id := private.my_membership(new.company_id);
    new.reviewed_at := now();
  end if;
  return new;
end $$;
create trigger interview_sessions_guard before update on public.interview_sessions
  for each row execute function private.interview_session_guard();

create trigger interview_campaigns_updated before update on public.interview_campaigns for each row execute function private.set_updated_at();
create trigger interview_assignments_updated before update on public.interview_assignments for each row execute function private.set_updated_at();
create trigger interview_sessions_updated before update on public.interview_sessions for each row execute function private.set_updated_at();
create trigger audit_interview_answers after insert on public.interview_answers for each row execute function private.audit_row();
create trigger audit_interview_sessions after insert or update on public.interview_sessions for each row execute function private.audit_row();

-- Helpers used by RLS: is the caller the respondent of a session/question?
create or replace function private.is_session_respondent(p_company uuid, p_session uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.interview_sessions s
                   join public.interview_assignments a on a.company_id = s.company_id and a.id = s.assignment_id
                  where s.company_id = p_company and s.id = p_session
                    and a.respondent_membership_id = private.my_membership(p_company))
$$;
create or replace function private.session_scope(p_company uuid, p_session uuid, out department_id uuid, out process_id uuid)
language sql stable security definer set search_path = '' as $$
  select a.department_id, a.process_id from public.interview_sessions s
    join public.interview_assignments a on a.company_id = s.company_id and a.id = s.assignment_id
   where s.company_id = p_company and s.id = p_session
$$;
create or replace function private.question_session(p_company uuid, p_question uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select session_id from public.interview_questions where company_id = p_company and id = p_question
$$;
create or replace function private.can_review_session(p_company uuid, p_session uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.has_permission(p_company, 'interview.review',
           (private.session_scope(p_company, p_session)).department_id,
           (private.session_scope(p_company, p_session)).process_id)
$$;
-- Respondent or a reviewer in scope may read interview content.
create or replace function private.can_read_session(p_company uuid, p_session uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.is_session_respondent(p_company, p_session)
      or private.has_permission(p_company, 'interview.review',
           (private.session_scope(p_company, p_session)).department_id,
           (private.session_scope(p_company, p_session)).process_id)
$$;
create or replace function private.session_is_open(p_company uuid, p_session uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.interview_sessions where company_id = p_company and id = p_session
                 and status in ('in_progress','reopened'))
$$;
grant execute on all functions in schema private to authenticated, service_role;

alter table public.question_templates      enable row level security;
alter table public.interview_campaigns     enable row level security;
alter table public.interview_assignments   enable row level security;
alter table public.interview_sessions      enable row level security;
alter table public.interview_questions     enable row level security;
alter table public.interview_answer_drafts enable row level security;
alter table public.interview_answers       enable row level security;

create policy qt_read on public.question_templates for select to authenticated using ((select private.is_active_member(company_id)));
create policy qt_write on public.question_templates for insert to authenticated with check ((select private.has_permission(company_id, 'interview.manage')));
create policy qt_update on public.question_templates for update to authenticated
  using ((select private.has_permission(company_id, 'interview.manage'))) with check ((select private.has_permission(company_id, 'interview.manage')));

create policy ic_read on public.interview_campaigns for select to authenticated
  using ((select private.has_permission(company_id, 'interview.manage', department_id, process_id))
      or (select private.has_permission(company_id, 'interview.review', department_id, process_id)));
create policy ic_write on public.interview_campaigns for insert to authenticated
  with check ((select private.has_permission(company_id, 'interview.manage', department_id, process_id)));
create policy ic_update on public.interview_campaigns for update to authenticated
  using ((select private.has_permission(company_id, 'interview.manage', department_id, process_id)))
  with check ((select private.has_permission(company_id, 'interview.manage', department_id, process_id)));

create policy ia_read on public.interview_assignments for select to authenticated
  using (respondent_membership_id = (select private.my_membership(company_id))
      or (select private.has_permission(company_id, 'interview.manage', department_id, process_id))
      or (select private.has_permission(company_id, 'interview.review', department_id, process_id)));
create policy ia_write on public.interview_assignments for insert to authenticated
  with check ((select private.has_permission(company_id, 'interview.manage', department_id, process_id)));
create policy ia_update on public.interview_assignments for update to authenticated
  using (respondent_membership_id = (select private.my_membership(company_id))
      or (select private.has_permission(company_id, 'interview.manage', department_id, process_id)))
  with check (respondent_membership_id = (select private.my_membership(company_id))
      or (select private.has_permission(company_id, 'interview.manage', department_id, process_id)));

create policy is_read on public.interview_sessions for select to authenticated
  using ((select private.can_read_session(company_id, id)));
create policy is_insert on public.interview_sessions for insert to authenticated
  with check (exists (select 1 from public.interview_assignments a where a.company_id = interview_sessions.company_id
                       and a.id = interview_sessions.assignment_id
                       and a.respondent_membership_id = (select private.my_membership(interview_sessions.company_id))));
create policy is_update on public.interview_sessions for update to authenticated
  using ((select private.can_read_session(company_id, id))) with check ((select private.can_read_session(company_id, id)));

create policy iq_read on public.interview_questions for select to authenticated
  using ((select private.can_read_session(company_id, session_id)));
create policy iq_insert on public.interview_questions for insert to authenticated
  with check ((select private.can_read_session(company_id, session_id)) and (select private.session_is_open(company_id, session_id)));

create policy iad_owner on public.interview_answer_drafts for all to authenticated
  using ((select private.is_session_respondent(company_id, private.question_session(company_id, question_id))))
  with check ((select private.is_session_respondent(company_id, private.question_session(company_id, question_id))));

create policy ians_read on public.interview_answers for select to authenticated
  using ((select private.can_read_session(company_id, private.question_session(company_id, question_id))));
-- Respondent answers while the session is open; a reviewer may record a correction revision any time.
create policy ians_insert on public.interview_answers for insert to authenticated
  with check (answered_by_membership_id = (select private.my_membership(company_id))
    and (   ((select private.is_session_respondent(company_id, private.question_session(company_id, question_id)))
             and (select private.session_is_open(company_id, private.question_session(company_id, question_id))))
         or (supersedes_answer_id is not null
             and (select private.can_review_session(company_id, private.question_session(company_id, question_id))))));
