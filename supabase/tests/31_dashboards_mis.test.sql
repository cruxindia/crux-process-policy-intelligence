-- PPI-042: dashboards, projects, MIS — access and scope, every report runs, no content leaks, project manager view.
begin;
select plan(30);

insert into auth.users (id, email) values (tests.uid('platform_owner'), 'platform_owner@example.invalid');
insert into private.platform_admins (user_id) values (tests.uid('platform_owner'));

select ok(exists (select 1 from public.roles where company_id = tests.company('ALPHA') and code = 'STAKEHOLDER'), 'every company has a STAKEHOLDER role');
select ok(exists (select 1 from public.role_permissions rp join public.roles r on r.id = rp.role_id where r.company_id = tests.company('ALPHA') and r.code = 'DEPT_HEAD' and rp.permission_code = 'report.read'),
          'department heads may read MIS (for their departments)');

-- company admin: whole company
select tests.login('a_admin'); set local role authenticated;
select is(public.company_dashboard(tests.company('ALPHA')) ->> 'scope', 'company', 'admin dashboard covers the whole company');
select ok(jsonb_typeof(public.company_dashboard(tests.company('ALPHA')) -> 'by_department') = 'array', 'dashboard has a department breakdown');
select is(jsonb_array_length(public.company_dashboard(tests.company('ALPHA')) -> 'trend'), 8, 'eight weeks of trend');
select lives_ok($$ select public.mis_report(tests.company('ALPHA'), r) from unnest(array['participation','people_progress','process_register','discovery_funnel','documents',
  'open_questions','tickets_sla','workload','improvements','ai_usage','api_usage','billing','projects','recognition']) r $$, 'all 14 company reports run');
select is(jsonb_array_length(public.mis_report(tests.company('ALPHA'), 'participation') -> 'columns'), 7, 'report has its columns');
select throws_ok($$ select public.mis_report(tests.company('ALPHA'), 'nonsense') $$, 'P0001', null, 'unknown report refused');
select throws_ok($$ select public.mis_report(tests.company('ALPHA'), 'participation', '2024-01-01', '2026-11-01') $$, 'P0001', null, 'period longer than two years refused');
select lives_ok($$ select public.project_save(tests.company('ALPHA'), null, 'DISC-1', 'Process discovery wave 1', 'Map operations', tests.mid('a_ops_head'), tests.mid('a_admin'),
  array[tests.dept('ALPHA', 'OPS')], '2026-11-01', '2027-01-31', 'active') $$, 'admin creates a project with a manager and sponsor');
select throws_ok($$ select public.project_save(tests.company('ALPHA'), null, 'DISC-1', 'Duplicate', null, null, null, null, null, null, null) $$, 'P0001', null, 'project codes are unique');
select ok(exists (select 1 from jsonb_array_elements(public.mis_report(tests.company('ALPHA'), 'projects') -> 'rows') r where r ->> 0 = 'DISC-1'), 'the project appears in the projects report');
reset role;

-- department head: own department only, company-wide reports refused
select tests.login('a_ops_head'); set local role authenticated;
select is(public.company_dashboard(tests.company('ALPHA')) ->> 'scope', 'departments', 'department head sees a department-scoped dashboard');
select is((select string_agg(d ->> 'name', ', ' order by d ->> 'name') from jsonb_array_elements(public.company_dashboard(tests.company('ALPHA')) -> 'by_department') d),
          'Operations (synthetic), Operations North (synthetic)', 'only their department and its sub-departments appear');
select is((public.company_dashboard(tests.company('ALPHA')) ->> 'documents'), null, 'company-level document figures are not shown to a department scope');
select throws_ok($$ select public.mis_report(tests.company('ALPHA'), 'documents') $$, '42501', null, 'company-wide reports need company-wide access');
select throws_ok($$ select public.mis_report(tests.company('ALPHA'), 'billing') $$, '42501', null, 'billing report: administrators only');
select lives_ok($$ select public.mis_report(tests.company('ALPHA'), 'participation') $$, 'department head runs the participation report');
-- the department head is the project manager
select lives_ok($$ select public.project_milestone_save(tests.company('ALPHA'), (select id from public.projects where code = 'DISC-1'), null, 'All OPS interviews done', '2026-12-15', null, false) $$,
                'the project manager adds a milestone');
select lives_ok($$ select public.project_milestone_save(tests.company('ALPHA'), (select id from public.projects where code = 'DISC-1'),
                   (select id from public.project_milestones limit 1), null, null, null, true) $$, 'and ticks it done');
select isnt((select done_at from public.project_milestones limit 1), null, 'milestone marked done');
reset role;

-- employee: nothing
select tests.login('a_ops_emp'); set local role authenticated;
select throws_ok($$ select public.company_dashboard(tests.company('ALPHA')) $$, '42501', null, 'employees have no dashboard');
select throws_ok($$ select public.mis_report(tests.company('ALPHA'), 'participation') $$, '42501', null, 'employees have no MIS');
select throws_ok($$ select public.project_save(tests.company('ALPHA'), null, 'X-1', 'Mine', null, null, null, null, null, null, null) $$, '42501', null, 'employees cannot create projects');
select is((select count(*)::int from public.projects), 1, 'employees can see the project exists (transparency)');
select throws_ok($$ select public.company_dashboard(tests.company('ALPHA'), (select id from public.projects where code = 'DISC-1')) $$, '42501', null, 'but not its dashboard');
reset role;

-- other company: isolated
select tests.login('b_admin'); set local role authenticated;
select throws_ok($$ select public.mis_report(tests.company('ALPHA'), 'participation') $$, '42501', null, 'another company''s admin cannot read ALPHA reports');
select is((select count(*)::int from public.projects), 0, 'nor see ALPHA projects');
reset role;

-- platform owner
select tests.login('platform_owner'); set local role authenticated;
select lives_ok($$ select public.platform_mis(r) from unnest(array['portfolio','revenue','receivables','ai_pool','support']) r $$, 'all 5 platform reports run');
reset role;
select tests.login('a_admin'); set local role authenticated;
select throws_ok($$ select public.platform_mis('portfolio') $$, '42501', null, 'platform reports: platform owner only');
reset role;

select * from finish();
rollback;
