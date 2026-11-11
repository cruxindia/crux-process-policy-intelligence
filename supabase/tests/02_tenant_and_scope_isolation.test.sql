-- AC-05 company isolation, AC-04 department/classification scope, IDOR, FR-02 scope rules.
begin;
select plan(16);

-- Fixtures (as postgres): knowledge records with different scopes/classifications.
insert into public.knowledge_records (id, company_id, record_type, title, claim_text, department_id, process_id, classification, claim_origin)
values
 ('11111111-0000-4000-8000-000000000001', tests.company('ALPHA'), 'fact', 'OPS internal', 'OPS internal claim', tests.dept('ALPHA','OPS'), tests.proc('ALPHA','OPS-P01'), 'internal', 'employee_statement'),
 ('11111111-0000-4000-8000-000000000002', tests.company('ALPHA'), 'fact', 'OPS confidential', 'OPS confidential claim', tests.dept('ALPHA','OPS'), null, 'confidential', 'employee_statement'),
 ('11111111-0000-4000-8000-000000000003', tests.company('ALPHA'), 'fact', 'OPS restricted', 'OPS restricted claim', tests.dept('ALPHA','OPS'), null, 'restricted', 'employee_statement'),
 ('11111111-0000-4000-8000-000000000004', tests.company('ALPHA'), 'fact', 'FIN internal', 'FIN internal claim', tests.dept('ALPHA','FIN'), null, 'internal', 'employee_statement'),
 ('11111111-0000-4000-8000-000000000005', tests.company('ALPHA'), 'fact', 'OPS-N child', 'OPS north claim', tests.dept('ALPHA','OPS-N'), null, 'internal', 'employee_statement'),
 ('11111111-0000-4000-8000-000000000006', tests.company('BETA'),  'fact', 'BETA ops', 'Beta claim', tests.dept('BETA','OPS'), null, 'internal', 'employee_statement');

-- Company B user
select tests.login('b_ops_head'); set local role authenticated;
select is((select count(*)::int from public.knowledge_records where company_id = tests.company('ALPHA')), 0, 'AC-05: company B sees no company A knowledge');
select is((select count(*)::int from public.knowledge_records where id = '11111111-0000-4000-8000-000000000001'), 0, 'IDOR: direct id lookup of company A record returns nothing');
select is((select count(*)::int from public.memberships where company_id = tests.company('ALPHA')), 0, 'AC-05: company B sees no company A memberships');
select is((select count(*)::int from public.processes where company_id = tests.company('ALPHA')), 0, 'AC-05: company B sees no company A processes');
select throws_ok($$ insert into public.knowledge_records (company_id, record_type, title, claim_text, department_id, claim_origin)
                    values (tests.company('ALPHA'), 'fact', 'x', 'x', tests.dept('ALPHA','OPS'), 'employee_statement') $$,
                 '42501', null, 'AC-05: company B cannot write into company A');
reset role;

-- Cross-tenant link is impossible even for a superuser (composite FK).
select throws_ok($$ insert into public.knowledge_records (company_id, record_type, title, claim_text, department_id, claim_origin)
                    values (tests.company('BETA'), 'fact', 'x', 'x', tests.dept('ALPHA','OPS'), 'employee_statement') $$,
                 '23503', null, 'tenant-safe FK: a company B record cannot point at a company A department');

-- Department head OPS
select tests.login('a_ops_head'); set local role authenticated;
select ok(exists(select 1 from public.knowledge_records where id = '11111111-0000-4000-8000-000000000001'), 'OPS head reads OPS internal');
select ok(exists(select 1 from public.knowledge_records where id = '11111111-0000-4000-8000-000000000002'), 'OPS head (confidential clearance) reads OPS confidential');
select ok(not exists(select 1 from public.knowledge_records where id = '11111111-0000-4000-8000-000000000003'), 'OPS head without restricted clearance cannot read OPS restricted');
select ok(not exists(select 1 from public.knowledge_records where id = '11111111-0000-4000-8000-000000000004'), 'AC-04: OPS head cannot read FIN material');
select ok(exists(select 1 from public.knowledge_records where id = '11111111-0000-4000-8000-000000000005'), 'department scope covers child department OPS-N');
reset role;

-- Employee OPS: no confidential clearance
select tests.login('a_ops_emp'); set local role authenticated;
select ok(not exists(select 1 from public.knowledge_records where id = '11111111-0000-4000-8000-000000000002'), 'employee cannot read confidential without clearance');
select throws_ok($$ insert into public.knowledge_records (company_id, record_type, title, claim_text, department_id, claim_origin)
                    values (tests.company('ALPHA'), 'fact', 'x', 'x', tests.dept('ALPHA','OPS'), 'employee_statement') $$,
                 '42501', null, 'employee lacks knowledge.edit → cannot create records');
reset role;

-- Admin: technical powers only
select tests.login('a_admin'); set local role authenticated;
select ok(not exists(select 1 from public.knowledge_records), 'company admin role does not imply knowledge read');
reset role;

-- Self-grant prevention and expired assignment
select tests.login('a_admin'); set local role authenticated;
select throws_ok($$ insert into public.role_assignments (company_id, membership_id, role_id, scope_type)
                    select tests.company('ALPHA'), tests.mid('a_admin'), id, 'company' from public.roles
                     where company_id = tests.company('ALPHA') and code = 'DOC_APPROVER' $$,
                 'P0001', null, 'SoD: an admin cannot grant themself the approver role');
reset role;
update public.role_assignments set valid_to = now() - interval '1 second', valid_from = now() - interval '1 day'
 where membership_id = tests.mid('a_ops_emp');
select tests.login('a_ops_emp'); set local role authenticated;
select is((select count(*)::int from public.processes), 0, 'expired role assignment grants nothing (deny by default)');
reset role;

select * from finish();
rollback;
