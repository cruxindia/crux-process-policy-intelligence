-- PPI-029: agent charters are versioned and immutable; board cases only via RPC; turns/outputs append-only; access by role.
begin;
select plan(16);

insert into public.agent_teams (id, company_id, code, name, mission)
values ('99999999-0000-4000-8000-000000000901', tests.company('ALPHA'), 'legal', 'Legal & Compliance', 'Synthetic mission');
insert into public.agent_roles (id, company_id, team_id, code, version, title, credentials, charter, charter_sha256)
values ('99999999-0000-4000-8000-000000000902', tests.company('ALPHA'), '99999999-0000-4000-8000-000000000901', 'legal_counsel', 1,
        'Corporate Counsel', 'Synthetic', repeat('Charter text. ', 20), encode(extensions.digest(repeat('Charter text. ', 20), 'sha256'), 'hex'));

select throws_ok($$ insert into public.agent_roles (company_id, team_id, code, version, title, credentials, charter, charter_sha256)
                    values (tests.company('ALPHA'), '99999999-0000-4000-8000-000000000901', 'x_role', 1, 'X', 'Y', repeat('z', 300), repeat('0', 64)) $$,
                 'P0001', null, 'charter hash must match the charter text');
select throws_ok($$ update public.agent_roles set charter = repeat('Changed. ', 40) where id = '99999999-0000-4000-8000-000000000902' $$,
                 'P0001', null, 'a charter cannot be edited in place (new version instead)');
select lives_ok($$ update public.agent_roles set status = 'retired' where id = '99999999-0000-4000-8000-000000000902' $$, 'a charter can be retired');
select throws_ok($$ delete from public.agent_roles where id = '99999999-0000-4000-8000-000000000902' $$, 'P0001', null, 'charters cannot be deleted');

-- employee: sees teams, cannot open cases or write board tables
select tests.login('a_ops_emp'); set local role authenticated;
select is((select count(*)::int from public.agent_teams), 1, 'members can see the expert teams');
select throws_ok($$ select public.open_board_case(tests.company('ALPHA'), 'document_draft', 'policy', 'Leave policy', 'brief', '{}', 'internal') $$,
                 '42501', null, 'an employee cannot open a drafting case');
select throws_ok($$ insert into public.board_cases (company_id, kind, title, created_by_membership_id) values (tests.company('ALPHA'), 'improvement_review', 'x', tests.mid('a_ops_emp')) $$,
                 '42501', null, 'board tables are not writable from the browser');
reset role;

-- department head opens a drafting case; approver decides
select tests.login('a_ops_head'); set local role authenticated;
select lives_ok($$ select public.open_board_case(tests.company('ALPHA'), 'document_draft', 'agreement', 'Field agency NDA', 'Mutual NDA', '{}', 'internal') $$,
                'a department head opens a drafting case');
select throws_ok($$ select public.open_board_case(tests.company('ALPHA'), 'improvement_review', null, 'Review', '', '{}', 'internal') $$,
                 'P0001', null, 'an improvement review needs at least one process');
select is((select count(*)::int from public.board_cases), 1, 'creator can read the case');
reset role;

insert into public.board_outputs (company_id, case_id, version, title, body_md, audit_verdict)
select company_id, id, 1, 'NDA', '# NDA', 'pass' from public.board_cases where title = 'Field agency NDA';
select throws_ok($$ update public.board_outputs set body_md = 'forged' $$, 'P0001', null, 'board outputs are append-only');
update public.board_cases set status = 'awaiting_approval' where title = 'Field agency NDA';

select tests.login('a_fin_head'); set local role authenticated;
select throws_ok($$ select public.decide_board_case(tests.company('ALPHA'), (select id from public.board_cases limit 1), 'approved') $$,
                 '42501', null, 'a non-approver cannot approve');
reset role;
select tests.login('a_approver'); set local role authenticated;
select throws_ok($$ select public.decide_board_case(tests.company('ALPHA'), (select id from public.board_cases limit 1), 'rejected', '') $$,
                 'P0001', null, 'a rejection needs a reason');
select lives_ok($$ select public.decide_board_case(tests.company('ALPHA'), (select id from public.board_cases limit 1), 'approved', 'ok') $$,
                'the approver approves');
reset role;
select is((select status from public.board_cases where title = 'Field agency NDA'), 'approved', 'case is approved');

-- policy: a training provider may take confidential with owner acceptance, never restricted
select throws_ok($$ update public.ai_provider_policies set max_classification = 'restricted', training_accepted_by_membership_id = tests.mid('a_admin'),
                      training_accepted_on = current_date, training_acceptance_note = 'Owner accepted the free tier risk in writing'
                    where company_id = tests.company('ALPHA') and provider = 'gemini_free' $$,
                 '23514', null, 'restricted data can never go to a provider that trains on inputs');

select * from finish();
rollback;
