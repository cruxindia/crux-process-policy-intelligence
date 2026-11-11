-- Generates docs/DATABASE_SCHEMA_REFERENCE.md body from the live catalog. Run with psql -t -A against a migrated DB.
with t as (
  select c.oid, c.relname, obj_description(c.oid) as descr, c.relrowsecurity as rls
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r' and c.relname not like 'pg_%'),
cols as (
  select t.relname, string_agg(format('| `%s` | %s | %s |', a.attname, format_type(a.atttypid, a.atttypmod),
           case when a.attnotnull then 'not null' else '' end), E'\n' order by a.attnum) body
    from t join pg_attribute a on a.attrelid = t.oid and a.attnum > 0 and not a.attisdropped group by t.relname),
fks as (
  select t.relname, string_agg(format('- %s', pg_get_constraintdef(c.oid)), E'\n' order by c.conname) body
    from t join pg_constraint c on c.conrelid = t.oid and c.contype = 'f' group by t.relname),
pols as (
  select tablename, string_agg(format('`%s` (%s)', policyname, cmd), ', ' order by policyname) body
    from pg_policies where schemaname = 'public' group by tablename),
trg as (
  select t.relname, string_agg(distinct tg.tgname, ', ') body
    from t join pg_trigger tg on tg.tgrelid = t.oid and not tg.tgisinternal group by t.relname)
select format(E'### `%s`\nRLS: %s · Policies: %s\n\nTriggers: %s\n\n| Column | Type | Null |\n|---|---|---|\n%s\n\n%s\n',
              t.relname, case when t.rls then 'enabled' else 'DISABLED' end, coalesce(p.body, 'none (deny all)'),
              coalesce(tr.body, '—'), c.body, coalesce(E'Foreign keys:\n' || f.body, ''))
  from t join cols c on c.relname = t.relname
  left join fks f on f.relname = t.relname
  left join pols p on p.tablename = t.relname
  left join trg tr on tr.relname = t.relname
 order by t.relname;
