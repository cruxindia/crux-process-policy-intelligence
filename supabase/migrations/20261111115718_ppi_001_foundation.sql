-- PPI-001 Foundation: schemas, extensions, shared trigger helpers.
create extension if not exists pgcrypto with schema extensions;

-- Non-API schema for security helpers (not exposed through PostgREST).
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated, service_role;

-- updated_at maintenance
create or replace function private.set_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- Append-only guard: blocks UPDATE and DELETE for every role (incl. service_role).
create or replace function private.forbid_mutation() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception 'PPI_APPEND_ONLY: % on %.% is not allowed; create a linked revision instead',
    tg_op, tg_table_schema, tg_table_name
    using errcode = 'P0001';
end $$;

-- Status transition guard. allowed = array of 'from>to' strings.
create or replace function private.assert_transition(p_table text, p_from text, p_to text, p_allowed text[])
returns void language plpgsql immutable set search_path = '' as $$
begin
  if p_from is distinct from p_to and not (p_from || '>' || p_to = any (p_allowed)) then
    raise exception 'PPI_BAD_TRANSITION: % status % -> % is not permitted', p_table, p_from, p_to
      using errcode = 'P0001';
  end if;
end $$;

-- Data classification ranking used by read rules and AI provider policy.
create or replace function private.classification_rank(p text) returns int
language sql immutable set search_path = '' as $$
  select case p when 'public' then 0 when 'internal' then 1 when 'confidential' then 2 when 'restricted' then 3 end
$$;

grant execute on all functions in schema private to authenticated, service_role;
