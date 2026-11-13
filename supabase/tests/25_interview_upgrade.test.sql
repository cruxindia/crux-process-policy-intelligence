-- PPI-033 (M3): suggested answers, not-applicable reason, saved for later, ask a colleague, department-head validation.
begin;
select plan(32);

select private.seed_blueprint_catalogue(tests.company('ALPHA'));
update public.catalogue_functions set department_id = tests.dept('ALPHA', 'OPS') where company_id = tests.company('ALPHA') and code = 'OPS';

insert into public.interview_campaigns (id, company_id, code, name, department_id, owner_membership_id, status, question_scopes, interview_mode)
values ('99999999-0000-4000-8000-000000000a01', tests.company('ALPHA'), 'DISC-M3', 'Discovery', tests.dept('ALPHA','OPS'), tests.mid('a_ops_head'), 'active', '{}', 'discovery');
insert into public.interview_assignments (id, company_id, campaign_id, respondent_membership_id, department_id) values
  ('99999999-0000-4000-8000-000000000a02', tests.company('ALPHA'), '99999999-0000-4000-8000-000000000a01', tests.mid('a_ops_emp'), tests.dept('ALPHA','OPS')),
  ('99999999-0000-4000-8000-000000000a12', tests.company('ALPHA'), '99999999-0000-4000-8000-000000000a01', tests.mid('a_ops_head'), tests.dept('ALPHA','OPS'));
insert into public.interview_sessions (id, company_id, assignment_id) values
  ('99999999-0000-4000-8000-000000000a03', tests.company('ALPHA'), '99999999-0000-4000-8000-000000000a02'),
  ('99999999-0000-4000-8000-000000000a13', tests.company('ALPHA'), '99999999-0000-4000-8000-000000000a12');
insert into public.interview_questions (id, company_id, session_id, seq, field_key, question_text, generated_by, suggestions)
select ('99999999-0000-4000-8000-0000000001' || lpad(n::text, 2, '0'))::uuid, tests.company('ALPHA'), '99999999-0000-4000-8000-000000000a03', n,
       'ai.process.alloc', 'Question ' || n, 'branch_rule', array['The Operations Manager assigns it', 'The system assigns it']
  from generate_series(1, 6) n;

select throws_ok($$ insert into public.interview_questions (company_id, session_id, seq, field_key, question_text, generated_by, suggestions)
                    values (tests.company('ALPHA'), '99999999-0000-4000-8000-000000000a03', 99, 'x', 'q', 'branch_rule', array['a','b','c','d']) $$,
                 '23514', null, 'at most 3 suggestions per question');

-- employee answers ------------------------------------------------------------------------------------------------------
select tests.login('a_ops_emp'); set local role authenticated;
select lives_ok($$ insert into public.interview_answers (company_id, question_id, answer_kind, answer_text, answered_by_membership_id, from_suggestion)
                   values (tests.company('ALPHA'), '99999999-0000-4000-8000-000000000101', 'answer', 'The Operations Manager assigns it', tests.mid('a_ops_emp'), true) $$,
                'an answer taken from a suggestion is recorded as such');
select throws_ok($$ insert into public.interview_answers (company_id, question_id, answer_kind, answered_by_membership_id)
                    values (tests.company('ALPHA'), '99999999-0000-4000-8000-000000000102', 'not_applicable', tests.mid('a_ops_emp')) $$,
                 '23514', null, '"not applicable" needs a reason');
select lives_ok($$ insert into public.interview_answers (company_id, question_id, answer_kind, answer_text, answered_by_membership_id)
                   values (tests.company('ALPHA'), '99999999-0000-4000-8000-000000000102', 'not_applicable', 'We have no approvals in this work', tests.mid('a_ops_emp')) $$,
                '"not applicable" with a reason is accepted');
select lives_ok($$ insert into public.interview_answers (company_id, question_id, answer_kind, answered_by_membership_id)
                   values (tests.company('ALPHA'), '99999999-0000-4000-8000-000000000103', 'deferred', tests.mid('a_ops_emp')) $$,
                '"save for later" is an answer kind');
select throws_ok($$ insert into public.interview_answers (company_id, question_id, answer_kind, answered_by_membership_id, from_suggestion)
                    values (tests.company('ALPHA'), '99999999-0000-4000-8000-000000000104', 'unknown', tests.mid('a_ops_emp'), true) $$,
                 '23514', null, 'only a real answer can come from a suggestion');

-- ask a colleague -------------------------------------------------------------------------------------------------------
select lives_ok($$ select public.interview_ask_colleague(tests.company('ALPHA'), '99999999-0000-4000-8000-000000000104', tests.mid('a_fin_head'), 'She knows the payment limits') $$,
                'the respondent can ask a colleague about an interview question');
select is((select count(*)::int from public.interview_help_requests where question_id = '99999999-0000-4000-8000-000000000104'), 1, 'the request is visible to the respondent');
select is((select answer_kind || '|' || referred_membership_id::text from public.interview_current_answers where question_id = '99999999-0000-4000-8000-000000000104'),
          'refer_to_owner|' || tests.mid('a_fin_head')::text, 'the question is answered "someone else knows" with that colleague');
select throws_ok($$ select public.interview_ask_colleague(tests.company('ALPHA'), '99999999-0000-4000-8000-000000000104', tests.mid('a_fin_head')) $$,
                 'P0001', null, 'the same colleague is not asked twice about one question');
select throws_ok($$ select public.interview_ask_colleague(tests.company('ALPHA'), '99999999-0000-4000-8000-000000000105', tests.mid('a_ops_emp')) $$,
                 'P0001', null, 'you cannot ask yourself');
select throws_ok($$ insert into public.interview_help_requests (company_id, session_id, question_id, task_id, requester_membership_id, helper_membership_id)
                    values (tests.company('ALPHA'), '99999999-0000-4000-8000-000000000a03', '99999999-0000-4000-8000-000000000105',
                            (select id from public.clarification_tasks limit 1), tests.mid('a_ops_emp'), tests.mid('a_fin_head')) $$,
                 '42501', null, 'help requests are created only through the function');
reset role;
select is((select status || '|' || assignee_membership_id::text from public.clarification_tasks where idempotency_key = 'interview-help:99999999-0000-4000-8000-000000000104:' || tests.mid('a_fin_head')),
          'assigned|' || tests.mid('a_fin_head')::text, 'a request is assigned to the colleague in the Requests module');

select tests.login('a_ops_head'); set local role authenticated;
select throws_ok($$ select public.interview_ask_colleague(tests.company('ALPHA'), '99999999-0000-4000-8000-000000000105', tests.mid('a_fin_head')) $$,
                 '42501', null, 'only the respondent can ask about their questions');
reset role;

select tests.login('a_fin_head'); set local role authenticated;
select is((select count(*)::int from public.interview_help_requests), 1, 'the colleague sees the request');
select lives_ok($$ insert into public.clarification_responses (company_id, task_id, responder_membership_id, response_text)
                   values (tests.company('ALPHA'), (select task_id from public.interview_help_requests limit 1), tests.mid('a_fin_head'), 'Payments above the limit go to the CFO') $$,
                'the colleague replies in the Requests module');
reset role;

select tests.login('a_admin'); set local role authenticated;
select is((select count(*)::int from public.interview_help_requests), 0, 'others cannot see interview help requests');
select is((select count(*)::int from public.interview_help_replies(tests.company('ALPHA'), '99999999-0000-4000-8000-000000000a03')), 0, 'nor the replies');
reset role;

select tests.login('a_ops_emp'); set local role authenticated;
select is((select reply from public.interview_help_replies(tests.company('ALPHA'), '99999999-0000-4000-8000-000000000a03')),
          'Payments above the limit go to the CFO', 'the respondent gets the colleague''s reply');
reset role;

-- department-head validation of the company process ---------------------------------------------------------------------
insert into public.discovered_processes (id, company_id, session_id, membership_id, process_key, name, flow_version) values
  ('99999999-0000-4000-8000-000000000a04', tests.company('ALPHA'), '99999999-0000-4000-8000-000000000a03', tests.mid('a_ops_emp'), 'alloc', 'Case allocation', 2),
  ('99999999-0000-4000-8000-000000000a14', tests.company('ALPHA'), '99999999-0000-4000-8000-000000000a13', tests.mid('a_ops_head'), 'alloc', 'Case allocation', 1),
  ('99999999-0000-4000-8000-000000000a15', tests.company('ALPHA'), '99999999-0000-4000-8000-000000000a13', tests.mid('a_ops_head'), 'escal', 'Escalations', 1);
insert into public.catalogue_item_sources (company_id, item_id, discovered_process_id, linked_by)
select tests.company('ALPHA'), i.id, v.dp::uuid, tests.mid('a_ops_head')
  from (values ('OPS-P01', '99999999-0000-4000-8000-000000000a04'), ('OPS-P01', '99999999-0000-4000-8000-000000000a14'),
               ('OPS-P05', '99999999-0000-4000-8000-000000000a15')) v(code, dp)
  join public.catalogue_items i on i.company_id = tests.company('ALPHA') and i.code = v.code;

select ok(exists (select 1 from public.role_permissions rp join public.roles r on r.id = rp.role_id
                   where r.company_id = tests.company('ALPHA') and r.code = 'DEPT_HEAD' and rp.permission_code = 'process.validate'),
          'department heads hold process.validate');

select tests.login('a_ops_emp'); set local role authenticated;
select throws_ok($$ select public.process_validate(tests.company('ALPHA'), (select id from public.catalogue_items where code = 'OPS-P01'), 'validated') $$,
                 '42501', null, 'an employee cannot validate');
reset role;
select tests.login('a_fin_head'); set local role authenticated;
select throws_ok($$ select public.process_validate(tests.company('ALPHA'), (select id from public.catalogue_items where code = 'OPS-P01'), 'validated') $$,
                 '42501', null, 'another department''s head cannot validate');
reset role;

select tests.login('a_ops_head'); set local role authenticated;
select throws_ok($$ select public.process_validate(tests.company('ALPHA'), (select id from public.catalogue_items where code = 'OPS-P05'), 'validated') $$,
                 'P0001', 'PPI_MAKER_CHECKER: only you described this process, so someone else with validation rights must confirm it',
                 'nobody validates a process only they described');
select throws_ok($$ select public.process_validate(tests.company('ALPHA'), (select id from public.catalogue_items where code = 'OPS-P02'), 'validated') $$,
                 'P0001', null, 'nothing to validate without interview descriptions');
select throws_ok($$ select public.process_validate(tests.company('ALPHA'), (select id from public.catalogue_items where code = 'OPS-P01'), 'validated') $$,
                 'P0001', 'PPI_INPUT: 1 question(s) are still open — add a note explaining why you validate anyway',
                 'open questions (here: one saved for later) need a note');
select throws_ok($$ select public.process_validate(tests.company('ALPHA'), (select id from public.catalogue_items where code = 'OPS-P01'), 'changes_requested', 'fix') $$,
                 'P0001', null, 'sending back needs a reason');
select lives_ok($$ select public.process_validate(tests.company('ALPHA'), (select id from public.catalogue_items where code = 'OPS-P01'), 'validated',
                   'The saved question is about a rare case; process confirmed') $$, 'the owning department head validates with a note');
select is((select decision || '|' || stale::text || '|' || open_items from public.process_validation_status(tests.company('ALPHA'))
            where item_id = (select id from public.catalogue_items where code = 'OPS-P01')), 'validated|false|1', 'status: validated, current, one open item');
select throws_ok($$ insert into public.process_validations (company_id, item_id, decision, note, snapshot, decided_by)
                    values (tests.company('ALPHA'), (select id from public.catalogue_items where code = 'OPS-P01'), 'validated', 'direct insert attempt', '[]', tests.mid('a_ops_head')) $$,
                 '42501', null, 'validations are recorded only through the function');
reset role;

insert into public.interview_answers (company_id, question_id, answer_kind, answered_by_membership_id)
values (tests.company('ALPHA'), '99999999-0000-4000-8000-000000000105', 'unknown', tests.mid('a_ops_emp'));
select is(private.catalogue_open_items(tests.company('ALPHA'), (select id from public.catalogue_items where code = 'OPS-P01')), 2,
          '"I don''t know" answers count as knowledge gaps to settle (PPI-035)');
update public.discovered_processes set flow_version = 3 where id = '99999999-0000-4000-8000-000000000a04';
select tests.login('a_ops_emp'); set local role authenticated;
select is((select stale from public.process_validation_status(tests.company('ALPHA'))
            where item_id = (select id from public.catalogue_items where code = 'OPS-P01')), true, 'a changed map marks the validation as out of date (visible to members)');
reset role;
select throws_ok($$ update public.process_validations set decision = 'changes_requested' $$, null, null, 'validations cannot be edited');

select * from finish();
rollback;
