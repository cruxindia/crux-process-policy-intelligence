-- PPI-022 Adaptive (AI-driven) interview engine: storage for AI analyses, discovery coverage and contradictions.
-- Provenance layers kept separate (Sprint 04 §9): the employee's original answer (interview_answers, append-only)
-- ≠ AI interpretation (interview_answer_analyses, append-only, linked to ai_runs) ≠ suggested/verified knowledge
-- (knowledge_records with claim_origin/lifecycle). AI rows are written only by the backend (service identity in the
-- interview-ai Edge Function); employees and reviewers can read them for sessions they may read, never write them.

alter table public.interview_campaigns
  add column interview_mode text not null default 'fixed' check (interview_mode in ('fixed','adaptive')),
  add column ai_provider text,                       -- must match an active ai_provider_policies.provider
  add column max_ai_questions int not null default 40 check (max_ai_questions between 1 and 200);

-- One AI analysis per analysed answer (per AI run). Never edited.
create table public.interview_answer_analyses (
  id                uuid not null default gen_random_uuid() primary key,
  company_id        uuid not null,
  session_id        uuid not null,
  answer_id         uuid not null,
  ai_run_id         uuid not null,
  understood_answer text not null,
  analysis          jsonb not null,                  -- validated structured output (facts, assumptions, gaps, risks, ...)
  created_at        timestamptz not null default now(),
  unique (company_id, id),
  foreign key (company_id, session_id) references public.interview_sessions(company_id, id),
  foreign key (company_id, answer_id) references public.interview_answers(company_id, id),
  foreign key (company_id, ai_run_id) references public.ai_runs(company_id, id)
);
create index iaa_session_idx on public.interview_answer_analyses (company_id, session_id);
create index iaa_answer_idx on public.interview_answer_analyses (company_id, answer_id);
create index iaa_run_idx on public.interview_answer_analyses (company_id, ai_run_id);
create trigger iaa_append_only before update or delete on public.interview_answer_analyses
  for each row execute function private.forbid_mutation();

-- Discovery coverage per dimension for a session (latest AI assessment; history is in the analyses).
create table public.interview_dimension_coverage (
  company_id  uuid not null,
  session_id  uuid not null,
  dimension   text not null check (dimension in ('company_context','purpose','trigger','ownership','workflow','systems',
                                                 'tat','exceptions','controls','dependencies','performance')),
  status      text not null default 'not_started' check (status in ('not_started','partial','sufficient')),
  note        text,
  ai_run_id   uuid,
  updated_at  timestamptz not null default now(),
  primary key (company_id, session_id, dimension),
  foreign key (company_id, session_id) references public.interview_sessions(company_id, id),
  foreign key (company_id, ai_run_id) references public.ai_runs(company_id, id)
);
create index idc_run_idx on public.interview_dimension_coverage (company_id, ai_run_id);

-- Contradictions between answers: both answers are kept; a clarification requirement is recorded (Sprint 04 §7C).
create table public.interview_clarifications (
  id                   uuid not null default gen_random_uuid() primary key,
  company_id           uuid not null,
  session_id           uuid not null,
  earlier_answer_id    uuid not null,
  later_answer_id      uuid not null,
  description          text not null check (length(trim(description)) > 0),
  question_id          uuid,                         -- the clarification question asked (if any)
  status               text not null default 'open' check (status in ('open','resolved','dismissed')),
  raised_by_ai_run_id  uuid not null,
  resolved_by_ai_run_id uuid,
  resolution_note      text,
  created_at           timestamptz not null default now(),
  resolved_at          timestamptz,
  unique (company_id, id),
  foreign key (company_id, session_id) references public.interview_sessions(company_id, id),
  foreign key (company_id, earlier_answer_id) references public.interview_answers(company_id, id),
  foreign key (company_id, later_answer_id) references public.interview_answers(company_id, id),
  foreign key (company_id, question_id) references public.interview_questions(company_id, id),
  foreign key (company_id, raised_by_ai_run_id) references public.ai_runs(company_id, id),
  foreign key (company_id, resolved_by_ai_run_id) references public.ai_runs(company_id, id),
  check (earlier_answer_id <> later_answer_id)
);
create index icl_session_idx on public.interview_clarifications (company_id, session_id);
create index icl_earlier_idx on public.interview_clarifications (company_id, earlier_answer_id);
create index icl_later_idx on public.interview_clarifications (company_id, later_answer_id);
create index icl_question_idx on public.interview_clarifications (company_id, question_id);
create index icl_raised_idx on public.interview_clarifications (company_id, raised_by_ai_run_id);
create index icl_resolved_idx on public.interview_clarifications (company_id, resolved_by_ai_run_id);
-- Only status/resolution may change; the recorded conflict itself is immutable.
create or replace function private.interview_clarification_guard() returns trigger
language plpgsql set search_path = '' as $$
begin
  if (new.company_id, new.session_id, new.earlier_answer_id, new.later_answer_id, new.description, new.raised_by_ai_run_id, new.created_at)
     is distinct from (old.company_id, old.session_id, old.earlier_answer_id, old.later_answer_id, old.description, old.raised_by_ai_run_id, old.created_at) then
    raise exception 'PPI_IMMUTABLE: a recorded contradiction cannot be edited' using errcode = 'P0001';
  end if;
  perform private.assert_transition('interview_clarification', old.status, new.status, array['open>resolved','open>dismissed']);
  if new.status <> old.status then new.resolved_at := now(); end if;
  return new;
end $$;
create trigger icl_guard before update on public.interview_clarifications for each row execute function private.interview_clarification_guard();
create trigger icl_no_delete before delete on public.interview_clarifications for each row execute function private.forbid_mutation();

alter table public.interview_answer_analyses enable row level security;
alter table public.interview_dimension_coverage enable row level security;
alter table public.interview_clarifications enable row level security;
create policy iaa_read on public.interview_answer_analyses for select to authenticated using ((select private.can_read_session(company_id, session_id)));
create policy idc_read on public.interview_dimension_coverage for select to authenticated using ((select private.can_read_session(company_id, session_id)));
create policy icl_read on public.interview_clarifications for select to authenticated using ((select private.can_read_session(company_id, session_id)));
-- No insert/update/delete policies: written only by the backend AI service.
revoke insert, update, delete, truncate, references, trigger on public.interview_answer_analyses, public.interview_dimension_coverage,
       public.interview_clarifications from anon, authenticated;
revoke all on public.interview_answer_analyses, public.interview_dimension_coverage, public.interview_clarifications from anon;

create trigger audit_interview_clarifications after insert or update on public.interview_clarifications for each row execute function private.audit_row();
revoke all on function private.interview_clarification_guard() from public, anon, authenticated;
