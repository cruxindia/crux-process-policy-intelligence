-- PPI-043: my_impact — every member sees their own contribution and company totals; non-members refused.
begin;
select plan(5);
select tests.login('a_ops_emp'); set local role authenticated;
select ok(public.my_impact(tests.company('ALPHA')) ? 'me', 'an employee sees their own impact');
select ok((public.my_impact(tests.company('ALPHA')) -> 'company' ->> 'people')::int > 0, 'and the company totals');
select is(jsonb_typeof(public.my_impact(tests.company('ALPHA')) -> 'me' -> 'top5'), 'boolean', 'top-5 flag is a yes/no, no ranking of others');
select ok(not (public.my_impact(tests.company('ALPHA'))::text ~ '[0-9a-f]{8}-[0-9a-f]{4}-'), 'no ids of other people are returned');
select throws_ok($$ select public.my_impact(tests.company('BETA')) $$, '42501', null, 'not for another company');
select * from finish();
rollback;
