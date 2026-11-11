-- Schema-wide security properties (NFR-01, NFR-02).
begin;
select plan(7);

select is(
  (select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity),
  0, 'RLS is enabled on every public table');

select is(
  (select count(*)::int from information_schema.role_table_grants
    where table_schema = 'public' and grantee = 'anon'),
  0, 'anon has no table privileges at all');

select is(
  (select count(*)::int from information_schema.role_table_grants
    where table_schema = 'public' and grantee = 'authenticated' and privilege_type in ('TRUNCATE','REFERENCES','TRIGGER')),
  0, 'authenticated cannot truncate/reference/trigger');

select set_eq(
  $$ select table_name::text from information_schema.role_table_grants
      where table_schema = 'public' and grantee = 'authenticated' and privilege_type = 'DELETE' $$,
  array['interview_answer_drafts','knowledge_sources','process_steps','process_edges','process_step_sources','document_version_sources'],
  'authenticated may delete only draft working-set tables');

select is(
  (select count(*)::int from pg_constraint c where c.contype = 'f' and c.connamespace = 'public'::regnamespace
     and not exists (select 1 from pg_index i where i.indrelid = c.conrelid
       and (i.indkey::int2[])[0:array_length(c.conkey,1)-1] @> c.conkey
       and c.conkey @> (i.indkey::int2[])[0:array_length(c.conkey,1)-1])),
  0, 'every foreign key has a supporting index');

select is(
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'private' and p.prosecdef
      and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) cfg where cfg like 'search_path=%')),
  0, 'every SECURITY DEFINER helper pins search_path');

select is(
  (select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'v'
      and not coalesce((select bool_or(o = 'security_invoker=true') from unnest(c.reloptions) o), false)),
  0, 'every public view runs as security_invoker (RLS applies)');

select * from finish();
rollback;
