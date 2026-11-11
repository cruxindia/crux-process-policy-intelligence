-- LOCAL TEST HELPERS ONLY. Applied after seed by scripts/test-db.sh.
create schema if not exists tests;
grant usage on schema tests to authenticated, service_role;

-- Seed handle → ids
create or replace function tests.uid(h text) returns uuid language sql immutable as $$ select md5('ppi:' || h)::uuid $$;
create or replace function tests.company(code text) returns uuid language sql stable as $$ select id from public.companies where companies.code = $1 $$;
create or replace function tests.mid(h text) returns uuid language sql stable security definer set search_path = '' as $$
  select id from public.memberships where user_id = tests.uid(h) $$;
create or replace function tests.dept(co text, code text) returns uuid language sql stable security definer set search_path = '' as $$
  select d.id from public.departments d join public.companies c on c.id = d.company_id where c.code = co and d.code = $2 $$;
create or replace function tests.proc(co text, code text) returns uuid language sql stable security definer set search_path = '' as $$
  select p.id from public.processes p join public.companies c on c.id = p.company_id where c.code = co and p.code = $2 $$;

-- Set JWT claims for the next statements (call as postgres, then SET LOCAL ROLE authenticated).
create or replace function tests.login(h text, actor_type text default 'user') returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', tests.uid(h), 'role', 'authenticated', 'actor_type', actor_type)::text, true)
$$;
grant execute on all functions in schema tests to authenticated, service_role;
create or replace function tests.logout() returns void language sql as $$ select set_config('request.jwt.claims', '', true) $$;
grant execute on function tests.logout() to authenticated, service_role;
