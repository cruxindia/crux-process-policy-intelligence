-- PPI-028: only a human with process.edit in the owning department (and read access to the conversation) moves AI output
-- into the governed catalogue; it lands as a 'candidate'; linking is one-time and audited.
begin;
select plan(9);

insert into public.interview_campaigns (id, company_id, code, name, department_id, owner_membership_id, status, question_scopes, interview_mode)
values ('99999999-0000-4000-8000-000000000801', tests.company('ALPHA'), 'DISC-P', 'Discovery', tests.dept('ALPHA','OPS'), tests.mid('a_ops_head'), 'active', '{}', 'discovery');
insert into public.interview_assignments (id, company_id, campaign_id, respondent_membership_id, department_id)
values ('99999999-0000-4000-8000-000000000802', tests.company('ALPHA'), '99999999-0000-4000-8000-000000000801', tests.mid('a_ops_emp'), tests.dept('ALPHA','OPS'));
insert into public.interview_sessions (id, company_id, assignment_id) values ('99999999-0000-4000-8000-000000000803', tests.company('ALPHA'), '99999999-0000-4000-8000-000000000802');
insert into public.discovered_processes (id, company_id, session_id, membership_id, process_key, name, purpose) values
  ('99999999-0000-4000-8000-000000000804', tests.company('ALPHA'), '99999999-0000-4000-8000-000000000803', tests.mid('a_ops_emp'), 'case_allocation', 'Case allocation', 'Assign cases'),
  ('99999999-0000-4000-8000-000000000805', tests.company('ALPHA'), '99999999-0000-4000-8000-000000000803', tests.mid('a_ops_emp'), 'intake', 'Request intake', null);

-- employee (no process.edit) cannot promote their own conversation
select tests.login('a_ops_emp'); set local role authenticated;
select throws_ok($$ select public.promote_discovered_process(tests.company('ALPHA'), '99999999-0000-4000-8000-000000000804', 'OPS-P10', tests.dept('ALPHA','OPS')) $$,
                 '42501', null, 'an employee cannot add their own AI-discovered process to the catalogue');
reset role;

-- finance head: cannot read this conversation
select tests.login('a_fin_head'); set local role authenticated;
select throws_ok($$ select public.promote_discovered_process(tests.company('ALPHA'), '99999999-0000-4000-8000-000000000804', 'FIN-P10', tests.dept('ALPHA','FIN')) $$,
                 'P0001', null, 'a head of another department cannot see (or promote) this conversation');
reset role;

-- operations head: promotes as candidate, links, audits; second attempt refused
select tests.login('a_ops_head'); set local role authenticated;
select throws_ok($$ select public.promote_discovered_process(tests.company('ALPHA'), '99999999-0000-4000-8000-000000000804', 'bad code!', tests.dept('ALPHA','OPS')) $$,
                 'P0001', null, 'process codes are validated');
select throws_ok($$ select public.promote_discovered_process(tests.company('ALPHA'), '99999999-0000-4000-8000-000000000804', 'FIN-P11', tests.dept('ALPHA','FIN')) $$,
                 '42501', null, 'cannot add a process owned by a department outside your scope');
select lives_ok($$ select public.promote_discovered_process(tests.company('ALPHA'), '99999999-0000-4000-8000-000000000804', 'ops-p10', tests.dept('ALPHA','OPS')) $$,
                'department head adds the discovered process to the catalogue');
reset role;
select is((select status from public.processes where company_id = tests.company('ALPHA') and code = 'OPS-P10'), 'candidate', 'it enters the catalogue as a candidate, not approved');
select is((select linked_process_id from public.discovered_processes where id = '99999999-0000-4000-8000-000000000804'),
          (select id from public.processes where company_id = tests.company('ALPHA') and code = 'OPS-P10'), 'discovered process is linked to the catalogue entry');
select tests.login('a_ops_head'); set local role authenticated;
select lives_ok($$ select public.promote_discovered_process(tests.company('ALPHA'), '99999999-0000-4000-8000-000000000805', null, null, 'internal', tests.proc('ALPHA','OPS-P01')) $$,
                'can link to an existing catalogue process instead');
reset role;
select is((select count(*)::int from public.audit_events where action in ('DISCOVERED_PROCESS_PROMOTED','DISCOVERED_PROCESS_LINKED') and company_id = tests.company('ALPHA')), 2, 'both are audited');

select * from finish();
rollback;
