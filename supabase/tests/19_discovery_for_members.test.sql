-- PPI-027: existing members get the discovery conversation without choosing anything; idempotent; no cross-tenant effect.
begin;
select plan(7);

select tests.login('a_ops_emp'); set local role authenticated;
select is(public.my_discovery_assignment(tests.company('ALPHA')), null, 'no active discovery campaign → nothing is created');
reset role;

insert into public.interview_campaigns (id, company_id, code, name, department_id, owner_membership_id, status, question_scopes, interview_mode)
values ('99999999-0000-4000-8000-000000000701', tests.company('ALPHA'), 'DISC-ALL', 'Discovery', tests.dept('ALPHA','OPS'), tests.mid('a_ops_head'), 'active', '{}', 'discovery');

select tests.login('a_ops_emp'); set local role authenticated;
select isnt(public.my_discovery_assignment(tests.company('ALPHA')), null, 'an existing member gets a discovery assignment');
select is(public.my_discovery_assignment(tests.company('ALPHA')),
          (select id from public.interview_assignments where campaign_id = '99999999-0000-4000-8000-000000000701'), 'calling again returns the same assignment');
select is((select count(*)::int from public.interview_assignments where campaign_id = '99999999-0000-4000-8000-000000000701'), 1, 'no duplicates');
select is((select department_id from public.interview_assignments where campaign_id = '99999999-0000-4000-8000-000000000701'),
          tests.dept('ALPHA','OPS'), 'assigned to the member''s own department');
select is(public.my_discovery_assignment(tests.company('BETA')), null, 'no effect in a company the caller does not belong to');
reset role;

select is((select count(*)::int from public.audit_events where action = 'DISCOVERY_ASSIGNED' and company_id = tests.company('ALPHA')), 1, 'creation is audited');

select * from finish();
rollback;
