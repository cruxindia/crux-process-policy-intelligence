-- PPI-022 adaptive interview storage: AI artefacts written only by the backend; readable with the session; immutable conflicts.
begin;
select plan(12);
-- Fixture (owner = backend): adaptive campaign, session with 2 answers, an AI run, an analysis, coverage and a contradiction.
insert into public.ai_provider_policies (company_id, provider, max_classification, may_train_on_inputs, terms_checked_on)
values (tests.company('ALPHA'), 'gemini_paid', 'confidential', false, date '2026-11-11');
insert into public.prompt_versions (id, company_id, prompt_key, version, purpose, template_sha256, output_schema, status)
values ('99999999-0000-4000-8000-000000000401', tests.company('ALPHA'), 'interview.adaptive', 1, 'Adaptive interview turn',
        repeat('a', 64), '{"type":"object"}', 'active');
insert into public.interview_campaigns (id, company_id, code, name, department_id, owner_membership_id, status, interview_mode, ai_provider)
values ('99999999-0000-4000-8000-000000000402', tests.company('ALPHA'), 'ADAPT-1', 'Adaptive', tests.dept('ALPHA','OPS'), tests.mid('a_ops_head'),
        'active', 'adaptive', 'gemini_paid');
insert into public.interview_assignments (id, company_id, campaign_id, respondent_membership_id, department_id)
values ('99999999-0000-4000-8000-000000000403', tests.company('ALPHA'), '99999999-0000-4000-8000-000000000402', tests.mid('a_ops_emp'), tests.dept('ALPHA','OPS'));
insert into public.interview_sessions (id, company_id, assignment_id) values ('99999999-0000-4000-8000-000000000404', tests.company('ALPHA'), '99999999-0000-4000-8000-000000000403');
insert into public.interview_questions (id, company_id, session_id, seq, field_key, question_text, generated_by) values
  ('99999999-0000-4000-8000-000000000405', tests.company('ALPHA'), '99999999-0000-4000-8000-000000000404', 1, 'self.designation', 'Designation?', 'template'),
  ('99999999-0000-4000-8000-000000000406', tests.company('ALPHA'), '99999999-0000-4000-8000-000000000404', 2, 'self.tat', 'TAT?', 'template');
insert into public.interview_answers (id, company_id, question_id, answer_text, answered_by_membership_id) values
  ('99999999-0000-4000-8000-000000000407', tests.company('ALPHA'), '99999999-0000-4000-8000-000000000405', 'TAT is 24 hours', tests.mid('a_ops_emp')),
  ('99999999-0000-4000-8000-000000000408', tests.company('ALPHA'), '99999999-0000-4000-8000-000000000406', 'TAT is 3 days', tests.mid('a_ops_emp'));
insert into public.ai_runs (id, company_id, capability, provider, model, prompt_version_id, data_classification, requested_by_membership_id, status)
values ('99999999-0000-4000-8000-000000000409', tests.company('ALPHA'), 'interview_followup', 'gemini_paid', 'gemini-test', '99999999-0000-4000-8000-000000000401',
        'internal', tests.mid('a_ops_emp'), 'succeeded');
insert into public.interview_questions (id, company_id, session_id, seq, field_key, question_text, rationale, generated_by, ai_run_id, prompt_version_id, parent_question_id)
values ('99999999-0000-4000-8000-000000000410', tests.company('ALPHA'), '99999999-0000-4000-8000-000000000404', 3, 'ai.tat',
        'You said 24 hours and 3 days — which applies when?', 'Two different TATs were given', 'ai',
        '99999999-0000-4000-8000-000000000409', '99999999-0000-4000-8000-000000000401', '99999999-0000-4000-8000-000000000406');
insert into public.interview_answer_analyses (company_id, session_id, answer_id, ai_run_id, understood_answer, analysis)
values (tests.company('ALPHA'), '99999999-0000-4000-8000-000000000404', '99999999-0000-4000-8000-000000000408', '99999999-0000-4000-8000-000000000409',
        'TAT stated as 3 days', '{"identified_facts":["TAT 3 days"]}');
insert into public.interview_dimension_coverage (company_id, session_id, dimension, status, ai_run_id)
values (tests.company('ALPHA'), '99999999-0000-4000-8000-000000000404', 'tat', 'partial', '99999999-0000-4000-8000-000000000409');
insert into public.interview_clarifications (id, company_id, session_id, earlier_answer_id, later_answer_id, description, question_id, raised_by_ai_run_id)
values ('99999999-0000-4000-8000-000000000411', tests.company('ALPHA'), '99999999-0000-4000-8000-000000000404', '99999999-0000-4000-8000-000000000407',
        '99999999-0000-4000-8000-000000000408', '24 hours vs 3 days', '99999999-0000-4000-8000-000000000410', '99999999-0000-4000-8000-000000000409');

select throws_ok($$ insert into public.ai_runs (company_id, capability, provider, model, prompt_version_id, data_classification)
                    values (tests.company('ALPHA'), 'interview_followup', 'gemini_free', 'x', '99999999-0000-4000-8000-000000000401', 'internal') $$,
                 'P0001', null, 'a free (training) provider is refused internal interview data');

select tests.login('a_ops_emp'); set local role authenticated;
select is((select count(*)::int from public.interview_answer_analyses where session_id = '99999999-0000-4000-8000-000000000404'), 1, 'respondent reads the AI analysis of own interview');
select is((select status from public.interview_dimension_coverage where session_id = '99999999-0000-4000-8000-000000000404' and dimension = 'tat'), 'partial', 'respondent reads coverage');
select is((select count(*)::int from public.interview_clarifications where status = 'open'), 1, 'respondent sees the open clarification');
select throws_ok($$ insert into public.interview_answer_analyses (company_id, session_id, answer_id, ai_run_id, understood_answer, analysis)
                    values (tests.company('ALPHA'), '99999999-0000-4000-8000-000000000404', '99999999-0000-4000-8000-000000000407',
                            '99999999-0000-4000-8000-000000000409', 'forged', '{}') $$, '42501', null, 'respondent cannot forge an AI analysis');
select throws_ok($$ update public.interview_dimension_coverage set status = 'sufficient' $$, '42501', null, 'respondent cannot change coverage');
select throws_ok($$ insert into public.interview_clarifications (company_id, session_id, earlier_answer_id, later_answer_id, description, raised_by_ai_run_id)
                    values (tests.company('ALPHA'), '99999999-0000-4000-8000-000000000404', '99999999-0000-4000-8000-000000000407',
                            '99999999-0000-4000-8000-000000000408', 'x', '99999999-0000-4000-8000-000000000409') $$, '42501', null, 'respondent cannot create clarifications');
reset role;
select tests.login('a_fin_head'); set local role authenticated;
select is((select count(*)::int from public.interview_answer_analyses), 0, 'an unrelated department head cannot read the analysis');
reset role;
select tests.login('a_be_reviewer'); set local role authenticated;
select is((select count(*)::int from public.interview_clarifications), 1, 'a company-wide reviewer can read clarifications');
reset role;

select throws_ok($$ update public.interview_clarifications set description = 'changed' where id = '99999999-0000-4000-8000-000000000411' $$,
                 'P0001', null, 'the recorded contradiction cannot be edited');
select throws_ok($$ update public.interview_answer_analyses set understood_answer = 'x' $$, 'P0001', null, 'AI analyses are append-only');
select is((select count(*)::int from public.interview_answers where id in ('99999999-0000-4000-8000-000000000407','99999999-0000-4000-8000-000000000408')), 2,
          'both conflicting original answers are preserved');
select * from finish();
rollback;
