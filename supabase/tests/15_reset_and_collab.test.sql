-- PPI-021: admin password reset, member contacts, dispute visibility for clarification parties, notifications.
begin;
select plan(15);
create temp table t (k text primary key, v text);
grant all on t to authenticated;
-- a second administrator (to prove admins cannot reset each other)
insert into public.role_assignments (company_id, membership_id, role_id, scope_type)
select tests.company('ALPHA'), tests.mid('a_be_reviewer'), id, 'company' from public.roles where company_id = tests.company('ALPHA') and code = 'COMPANY_ADMIN';
update auth.users set encrypted_password = extensions.crypt('old-password', extensions.gen_salt('bf', 4)) where id = tests.uid('a_ops_emp');

select tests.login('a_ops_emp'); set local role authenticated;
select throws_ok($$ select public.admin_reset_password(tests.company('ALPHA'), tests.mid('a_ops_head')) $$, '42501', null, 'non-admin cannot reset passwords');
select is((select count(*)::int from public.member_contacts(tests.company('ALPHA'))), 0, 'non-admin sees no member contacts');
reset role;

select tests.login('a_admin'); set local role authenticated;
insert into t select 'pw', public.admin_reset_password(tests.company('ALPHA'), tests.mid('a_ops_emp'));
select throws_ok($$ select public.admin_reset_password(tests.company('ALPHA'), tests.mid('a_admin')) $$, 'P0001', null, 'admin cannot reset own password here');
select throws_ok($$ select public.admin_reset_password(tests.company('ALPHA'), tests.mid('a_be_reviewer')) $$, 'P0001', null, 'admin cannot reset another administrator');
select throws_ok($$ select public.admin_reset_password(tests.company('ALPHA'), tests.mid('b_ops_head')) $$, 'P0001', null, 'cannot reset a member of another company');
select ok((select count(*) from public.member_contacts(tests.company('ALPHA'))) >= 8, 'admin sees member contacts');
reset role;
select ok((select encrypted_password = extensions.crypt((select v from t where k = 'pw'), encrypted_password) from auth.users where id = tests.uid('a_ops_emp')),
          'reset sets the returned temporary password (hash only)');
select is((select count(*)::int from public.audit_events where action = 'PASSWORD_RESET' and object_id = tests.mid('a_ops_emp')::text), 1, 'reset is audited');
select tests.login('a_ops_emp'); set local role authenticated;
select ok(public.password_change_required(), 'reset person must choose a new password');
reset role;

-- Clarification OPS -> FIN, escalated into a dispute decided by the approver.
select tests.login('a_ops_head'); set local role authenticated;
insert into public.clarification_tasks (id, company_id, requesting_department_id, assignee_department_id, assignee_membership_id, question_text, requester_membership_id)
values ('99999999-0000-4000-8000-000000000301', tests.company('ALPHA'), tests.dept('ALPHA','OPS'), tests.dept('ALPHA','FIN'), tests.mid('a_fin_head'),
        'Who approves vendor onboarding?', tests.mid('a_ops_head'));
reset role;
select tests.login('a_fin_head'); set local role authenticated;
insert into public.clarification_responses (company_id, task_id, responder_membership_id, response_text)
values (tests.company('ALPHA'), '99999999-0000-4000-8000-000000000301', tests.mid('a_fin_head'), 'Finance head approves.');
reset role;
select is((select count(*)::int from public.notifications where recipient_membership_id = tests.mid('a_ops_head') and kind = 'clarification_responses'), 1,
          'requester is notified of the reply');
select tests.login('a_ops_head'); set local role authenticated;
insert into public.disputes (id, company_id, issue_statement, department_id, clarification_task_id, decision_owner_membership_id, raised_by_membership_id)
values ('99999999-0000-4000-8000-000000000302', tests.company('ALPHA'), 'Ops says Ops head approves; Finance says Finance head.',
        tests.dept('ALPHA','OPS'), '99999999-0000-4000-8000-000000000301', tests.mid('a_approver'), tests.mid('a_ops_head'));
update public.clarification_tasks set status = 'disputed' where id = '99999999-0000-4000-8000-000000000301';
insert into public.dispute_positions (company_id, dispute_id, participant_membership_id, position_text)
values (tests.company('ALPHA'), '99999999-0000-4000-8000-000000000302', tests.mid('a_ops_head'), 'Ops head approves today.');
reset role;
select is((select count(*)::int from public.notifications where recipient_membership_id = tests.mid('a_approver') and kind = 'disputes'), 1,
          'decision owner is notified when a dispute is raised');
select tests.login('a_fin_head'); set local role authenticated;
select is((select count(*)::int from public.disputes where id = '99999999-0000-4000-8000-000000000302'), 1,
          'the other clarification party can see the dispute');
select lives_ok($$ insert into public.dispute_positions (company_id, dispute_id, participant_membership_id, position_text)
                   values (tests.company('ALPHA'), '99999999-0000-4000-8000-000000000302', tests.mid('a_fin_head'), 'Policy says Finance head.') $$,
                'the other party records their position');
reset role;
select tests.login('a_approver'); set local role authenticated;
insert into public.dispute_decisions (company_id, dispute_id, decided_by_membership_id, decision_text, rationale)
values (tests.company('ALPHA'), '99999999-0000-4000-8000-000000000302', tests.mid('a_approver'), 'Finance head approves.', 'Matches delegation of authority.');
reset role;
select is((select status from public.disputes where id = '99999999-0000-4000-8000-000000000302'), 'decided', 'human decision closes the dispute');
select is((select count(*)::int from public.notifications where recipient_membership_id = tests.mid('a_ops_head') and kind = 'dispute_decisions'), 1,
          'raiser is notified of the decision');

select * from finish();
rollback;
