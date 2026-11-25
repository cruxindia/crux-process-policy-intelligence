-- PPI-046: baseline library import (platform owner only), reconciliation, company adoption and register statuses.
begin;
select plan(15);
insert into auth.users (id, email) values (tests.uid('platform_owner'), 'platform_owner@example.invalid') on conflict do nothing;
insert into private.platform_admins (user_id, note) values (tests.uid('platform_owner'), 'test') on conflict do nothing;

select tests.login('a_admin'); set local role authenticated;
select throws_ok($$ select public.baseline_begin('IN-PVT', '1.0', 'Test baseline', null, 'x.xlsx', null, '{}'::jsonb) $$, '42501', null, 'a company admin cannot import a baseline');
reset role;

select tests.login('platform_owner'); set local role authenticated;
create temp table v as select public.baseline_begin('in-pvt', '1.0', 'Test baseline', '2026-11-21', 'x.xlsx', null,
  '{"Department Register":{"rows":3},"Process RACI Detail":{"rows":1},"Legal Applicability Decisions":{"rows":1},"Document Dependencies":{"rows":1}}'::jsonb) id;
select is((select code from public.baseline_versions where id = (select id from v)), 'IN-PVT', 'code is normalised');
select is(public.baseline_add_rows((select id from v), 'Department Register', '[
  {"row_no":2,"code":"GOV-001","title":"Governance Framework","department":"Board","data":{"Document ID":"GOV-001","Audit Criticality":"Critical"}},
  {"row_no":3,"code":"HR-001","title":"Recruitment","department":"Human Resources","data":{"Document ID":"HR-001"}}]'::jsonb), 2, 'rows are added in chunks');
select throws_like($$ select public.baseline_finish((select id from v)) $$, '%did not import completely%', 'an incomplete import cannot be activated');
select is(public.baseline_add_rows((select id from v), 'Department Register', '[{"row_no":4,"code":"HR-002","title":"Leave","department":"Human Resources","data":{}}]'::jsonb), 1, 'the missing row is added');
select public.baseline_add_rows((select id from v), 'Process RACI Detail', '[{"row_no":2,"code":"P01","title":"Hire to retire","data":{"Accountable (A)":"HR"}}]'::jsonb);
select public.baseline_add_rows((select id from v), 'Legal Applicability Decisions', '[{"row_no":5,"code":"AP-001","title":"Company classification","data":{"Role to Confirm":"Legal"}}]'::jsonb);
select public.baseline_add_rows((select id from v), 'Document Dependencies', '[{"row_no":2,"data":{"Prerequisite ID":"GOV-001","Dependent ID":"HR-001","Dependency Type":"Document → Document"}}]'::jsonb);
select is((public.baseline_finish((select id from v)) -> 'Department Register' ->> 'imported')::int, 3, 'finish reconciles and activates');
select is((select count(*)::int from public.baseline_links where version_id = (select id from v)), 1, 'dependency links are derived');
select throws_like($$ select public.baseline_begin('IN-PVT', '1.0', 'again', null, null, null, '{}'::jsonb) $$, '%already imported%', 'an active version cannot be overwritten');
reset role;

select tests.login('a_ops_emp'); set local role authenticated;
select is((select count(*)::int from public.baseline_items where version_id = (select id from v)), 6, 'every signed-in user can read an active baseline');
select throws_ok($$ select public.adopt_baseline(tests.company('ALPHA'), (select id from v)) $$, '42501', null, 'an employee cannot adopt a baseline');
select is((select count(*)::int from public.register_items where company_id = tests.company('ALPHA')), 0, 'and cannot read the register');
reset role;

select tests.login('a_admin'); set local role authenticated;
select is(public.adopt_baseline(tests.company('ALPHA'), (select id from v)), '{"documents": 3, "processes": 1, "applicability": 1}'::jsonb, 'adoption seeds the register');
select is(public.adopt_baseline(tests.company('ALPHA'), (select id from v)), '{"documents": 0, "processes": 0, "applicability": 0}'::jsonb, 'adoption is idempotent');
select throws_ok($$ select public.register_set_status(tests.company('ALPHA'), (select id from public.register_items where company_id = tests.company('ALPHA') and code = 'HR-002'), 'not_applicable', 'no') $$,
  '23514', null, '"not applicable" needs a reason');
select lives_ok($$ select public.register_set_status(tests.company('ALPHA'), (select id from public.register_items where company_id = tests.company('ALPHA') and code = 'HR-002'), 'not_applicable', 'No employees on leave scheme') $$,
  'with a reason it is accepted');
select * from finish();
rollback;
