-- PPI-050: the demo builder for documents (on a demo copy of ALPHA's data shape).
begin;
select plan(6);
insert into auth.users (id, email) values (tests.uid('platform_owner'), 'platform_owner@example.invalid') on conflict do nothing;
insert into private.platform_admins (user_id, note) values (tests.uid('platform_owner'), 'test') on conflict do nothing;
select tests.login('platform_owner'); set local role authenticated;
create temp table v as select public.baseline_begin('T-DEMO', '1', 'Test', null, null, null, '{"Department Register":{"rows":3}}'::jsonb) id;
select public.baseline_add_rows((select id from v), 'Department Register', '[
  {"row_no":2,"code":"HR-001","title":"Leave & Attendance Policy","department":"Human Resources","data":{"Audit Criticality":"High"}},
  {"row_no":3,"code":"FIN-001","title":"Travel & Expense Policy","department":"Finance","data":{"Audit Criticality":"Critical"}},
  {"row_no":4,"code":"OPS-001","title":"Escalation Matrix","department":"Operations","data":{"Audit Criticality":"Critical"}}]'::jsonb);
select public.baseline_finish((select id from v));
reset role;
update public.companies set is_demo = true where id = tests.company('ALPHA');
select throws_like($$ select private.build_demo_documents(tests.company('BETA')) $$, '%not a demo%', 'only demo companies');
create temp table res as select private.build_demo_documents(tests.company('ALPHA')) r;
select is(((select r from res)->>'rule_documents')::int, 12, 'twelve fictional rule documents');
select is((select status from public.register_items where company_id = tests.company('ALPHA') and code = 'OPS-001'), 'missing', 'an uncovered checklist item is missing');
select ok((select count(*) from public.doc_processes where company_id = tests.company('ALPHA') and jsonb_array_length(flow->'nodes') > 3) >= 5, 'processes carry flowcharts');
select is((select count(*)::int from public.doc_findings where company_id = tests.company('ALPHA') and kind = 'duplicate'), 1, 'two versions of the travel policy are reported');
select is((private.build_demo_documents(tests.company('ALPHA'))->>'skipped')::boolean, true, 'running it again changes nothing');
select * from finish();
rollback;
