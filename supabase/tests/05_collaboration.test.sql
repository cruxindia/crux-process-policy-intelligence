-- FR-10 clarification + dispute; AC-06 AI cannot close a dispute; AC-11 idempotent tasks/notifications; MVP steps 7–8.
begin;
select plan(18);

-- OPS head asks FIN a question, assigned to FIN head.
select tests.login('a_ops_head'); set local role authenticated;
insert into public.clarification_tasks (id, company_id, requesting_department_id, assignee_department_id, assignee_membership_id,
                                        process_id, question_text, priority, due_at, status, idempotency_key)
values ('44444444-0000-4000-8000-000000000001', tests.company('ALPHA'), tests.dept('ALPHA','OPS'), tests.dept('ALPHA','FIN'),
        tests.mid('a_fin_head'), tests.proc('ALPHA','OPS-P01'), 'What payment approval limit applies to refunds?', 'high',
        now() + interval '3 days', 'assigned', 'clar:refund-limit');
select is((select requester_membership_id from public.clarification_tasks where id = '44444444-0000-4000-8000-000000000001'),
          tests.mid('a_ops_head'), 'requester is stamped from the session, not client input');
select throws_ok($$ insert into public.clarification_tasks (company_id, requesting_department_id, assignee_department_id, question_text, idempotency_key)
                    values (tests.company('ALPHA'), tests.dept('ALPHA','OPS'), tests.dept('ALPHA','FIN'), 'dup', 'clar:refund-limit') $$,
                 '23505', null, 'AC-11: retry with same idempotency key does not create a duplicate task');
reset role;
select is((select count(*)::int from public.notifications where object_id = '44444444-0000-4000-8000-000000000001'), 1,
          'assignee notified exactly once');
update public.clarification_tasks set priority = 'urgent' where id = '44444444-0000-4000-8000-000000000001';
select is((select count(*)::int from public.notifications where object_id = '44444444-0000-4000-8000-000000000001'), 1,
          'AC-11: later updates do not duplicate the notification');

-- FIN head sees and answers; cannot resolve or re-route.
select tests.login('a_fin_head'); set local role authenticated;
select ok(exists(select 1 from public.clarification_tasks where id = '44444444-0000-4000-8000-000000000001'), 'assignee department sees the task');
select is((select count(*)::int from public.notifications), 1, 'assignee sees own notification');
insert into public.clarification_responses (company_id, task_id, responder_membership_id, response_text)
values (tests.company('ALPHA'), '44444444-0000-4000-8000-000000000001', tests.mid('a_fin_head'), 'Refunds above the configured limit need Finance head approval.');
select is((select status from public.clarification_tasks where id = '44444444-0000-4000-8000-000000000001'), 'response_submitted', 'response moves task to response_submitted');
select throws_ok($$ update public.clarification_tasks set status = 'resolved', outcome_text = 'ok' where id = '44444444-0000-4000-8000-000000000001' $$,
                 'P0001', null, 'responder cannot resolve the requester''s question');
select throws_ok($$ update public.clarification_tasks set question_text = 'changed' where id = '44444444-0000-4000-8000-000000000001' $$,
                 'P0001', null, 'original question cannot be edited');
reset role;
select tests.login('a_ops_emp'); set local role authenticated;
select is((select count(*)::int from public.clarification_responses), 0, 'unrelated employee cannot read the exchange');
reset role;
select tests.login('a_ops_head'); set local role authenticated;
update public.clarification_tasks set status = 'resolved', outcome_text = 'Finance head approval above limit' where id = '44444444-0000-4000-8000-000000000001';
select isnt((select resolved_at from public.clarification_tasks where id = '44444444-0000-4000-8000-000000000001'), null, 'requester resolves with outcome');

-- Dispute: two positions preserved; decision owner = approver.
insert into public.disputes (id, company_id, issue_statement, department_id, process_id, clarification_task_id, decision_owner_membership_id, context_differences)
values ('44444444-0000-4000-8000-000000000002', tests.company('ALPHA'), 'Who approves refunds below the limit?', tests.dept('ALPHA','OPS'),
        tests.proc('ALPHA','OPS-P01'), '44444444-0000-4000-8000-000000000001', tests.mid('a_approver'), 'OPS describes branch practice; FIN describes head office');
insert into public.dispute_positions (company_id, dispute_id, participant_membership_id, position_text)
values (tests.company('ALPHA'), '44444444-0000-4000-8000-000000000002', tests.mid('a_ops_head'), 'Branch coordinator approves below the limit.');
reset role;
select tests.login('a_fin_head'); set local role authenticated;
select throws_ok($$ insert into public.dispute_positions (company_id, dispute_id, participant_membership_id, position_text)
                    values (tests.company('ALPHA'), '44444444-0000-4000-8000-000000000002', tests.mid('a_fin_head'), 'x') $$,
                 '42501', null, 'non-participant without dispute scope cannot add a position');
reset role;
-- FIN head is invited by giving dispute.raise via a process-scoped assignment (as admin would)
select tests.logout();
insert into public.role_assignments (company_id, membership_id, role_id, scope_type, scope_process_id)
select tests.company('ALPHA'), tests.mid('a_fin_head'), id, 'process', tests.proc('ALPHA','OPS-P01') from public.roles
 where company_id = tests.company('ALPHA') and code = 'EMPLOYEE';
select tests.login('a_fin_head'); set local role authenticated;
insert into public.dispute_positions (company_id, dispute_id, participant_membership_id, position_text)
values (tests.company('ALPHA'), '44444444-0000-4000-8000-000000000002', tests.mid('a_fin_head'), 'Finance must approve every refund.');
update public.dispute_positions set position_text = 'softened' where participant_membership_id = tests.mid('a_ops_head');
select is((select position_text from public.dispute_positions where participant_membership_id = tests.mid('a_ops_head')),
          'Branch coordinator approves below the limit.', 'another participant cannot alter an opposing position');
reset role;
select throws_ok($$ delete from public.dispute_positions where dispute_id = '44444444-0000-4000-8000-000000000002' $$,
                 'P0001', null, 'positions cannot be deleted even by the database owner');

-- AC-06: AI cannot decide, even if given dispute.decide; dispute cannot be closed by status flip.
insert into public.role_permissions (company_id, role_id, permission_code)
select company_id, id, 'dispute.decide' from public.roles where company_id = tests.company('ALPHA') and code = 'AI_SERVICE';
select tests.login('a_ai', 'ai'); set local role authenticated;
select throws_ok($$ insert into public.dispute_decisions (company_id, dispute_id, decided_by_membership_id, decision_text, rationale)
                    values (tests.company('ALPHA'), '44444444-0000-4000-8000-000000000002', tests.mid('a_ai'), 'FIN wins', 'model says so') $$,
                 'P0001', null, 'AC-06: AI cannot decide a dispute');
select throws_ok($$ update public.disputes set status = 'decided' where id = '44444444-0000-4000-8000-000000000002' $$,
                 'P0001', null, 'AC-06: a dispute cannot be closed without a recorded human decision');
reset role;

select tests.login('a_approver'); set local role authenticated;
insert into public.dispute_decisions (company_id, dispute_id, decided_by_membership_id, decision_text, rationale)
values (tests.company('ALPHA'), '44444444-0000-4000-8000-000000000002', tests.mid('a_approver'),
        'Finance approval required above limit; coordinator below limit', 'Both practices valid in different contexts');
select is((select status from public.disputes where id = '44444444-0000-4000-8000-000000000002'), 'decided', 'human decision closes the dispute');
select is((select count(*)::int from public.dispute_positions where dispute_id = '44444444-0000-4000-8000-000000000002'), 2,
          'both positions preserved after the decision');
reset role;

select * from finish();
rollback;
