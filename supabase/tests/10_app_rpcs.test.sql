-- App RPCs: permission listing, starter templates, start/resume interview.
begin;
select plan(14);

-- Fixture: a company-scoped discovery lead (BE team runs discovery company-wide).
insert into public.roles (company_id, code, name) values (tests.company('ALPHA'), 'DISCOVERY_LEAD', 'Discovery lead (test)');
insert into public.role_permissions (company_id, role_id, permission_code)
select company_id, id, 'interview.manage' from public.roles where company_id = tests.company('ALPHA') and code = 'DISCOVERY_LEAD';
insert into public.role_assignments (company_id, membership_id, role_id, scope_type)
select tests.company('ALPHA'), tests.mid('a_be_reviewer'), id, 'company' from public.roles where company_id = tests.company('ALPHA') and code = 'DISCOVERY_LEAD';

select tests.login('a_ops_emp'); set local role authenticated;
select ok('evidence.upload' = any(array(select public.my_permissions(tests.company('ALPHA')))), 'my_permissions lists a held permission');
select ok(not ('knowledge.edit' = any(array(select public.my_permissions(tests.company('ALPHA'))))), 'my_permissions omits a permission not held');
select is((select count(*)::int from public.my_permissions(tests.company('BETA'))), 0, 'no permissions in a company you do not belong to');
select throws_ok($$ select public.load_starter_templates(tests.company('ALPHA')) $$, '42501', null, 'employee cannot load question templates');
reset role;

select tests.login('a_ops_head'); set local role authenticated;
select throws_ok($$ select public.load_starter_templates(tests.company('ALPHA')) $$, '42501', null,
                 'department-scoped head cannot create company-wide templates');
reset role;
select tests.login('a_be_reviewer'); set local role authenticated;
select is(public.load_starter_templates(tests.company('ALPHA')), 26, 'company-scoped discovery lead loads 26 starter templates');
select is(public.load_starter_templates(tests.company('ALPHA')), 0, 'loading again adds nothing (idempotent)');
reset role;
select tests.login('a_ops_head'); set local role authenticated;
insert into public.interview_campaigns (id, company_id, code, name, department_id, owner_membership_id, status)
values ('99999999-0000-4000-8000-000000000001', tests.company('ALPHA'), 'CAMP-APP', 'App test', tests.dept('ALPHA','OPS'), tests.mid('a_ops_head'), 'active');
insert into public.interview_assignments (id, company_id, campaign_id, respondent_membership_id, department_id)
values ('99999999-0000-4000-8000-000000000002', tests.company('ALPHA'), '99999999-0000-4000-8000-000000000001', tests.mid('a_ops_emp'), tests.dept('ALPHA','OPS'));
select throws_ok($$ select public.start_interview_session('99999999-0000-4000-8000-000000000002') $$, 'P0001', null,
                 'someone else cannot start the respondent''s interview');
reset role;

select tests.login('a_ops_emp'); set local role authenticated;
select isnt(public.start_interview_session('99999999-0000-4000-8000-000000000002'), null, 'respondent starts the interview');
select is((select count(*)::int from public.interview_questions q join public.interview_sessions s on s.id = q.session_id
            where s.assignment_id = '99999999-0000-4000-8000-000000000002'), 12, 'department interview gets the 12 department questions');
select is(public.start_interview_session('99999999-0000-4000-8000-000000000002'),
          (select id from public.interview_sessions where assignment_id = '99999999-0000-4000-8000-000000000002'),
          'calling again resumes the same session');
select is((select status from public.interview_assignments where id = '99999999-0000-4000-8000-000000000002'), 'in_progress',
          'assignment moves to in_progress');
select is((select name from public.interview_campaigns where id = '99999999-0000-4000-8000-000000000001'), 'App test',
          'respondent can read the campaign they are assigned to');
reset role;
select tests.login('a_fin_head'); set local role authenticated;
select is((select count(*)::int from public.interview_campaigns where id = '99999999-0000-4000-8000-000000000001'), 0,
          'a non-respondent outside the scope cannot read the campaign');
reset role;

select * from finish();
rollback;
