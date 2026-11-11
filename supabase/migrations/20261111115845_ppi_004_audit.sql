-- PPI-004 Audit events (FR-19). Append-only for every role; written only by SECURITY DEFINER trigger.

create table public.audit_events (
  id             bigint generated always as identity primary key,
  company_id     uuid not null references public.companies(id),
  occurred_at    timestamptz not null default now(),
  actor_user_id  uuid,
  actor_type     text not null,                 -- user | ai | service | system
  action         text not null,                 -- INSERT | UPDATE | DELETE
  object_type    text not null,
  object_id      text not null,
  changed_fields text[],
  before_data    jsonb,
  after_data     jsonb,
  correlation_id text
);
create index audit_events_object_idx on public.audit_events (company_id, object_type, object_id);
create index audit_events_time_idx on public.audit_events (company_id, occurred_at desc);

create trigger audit_events_append_only before update or delete on public.audit_events
  for each row execute function private.forbid_mutation();

-- Generic row audit. Large text bodies are reduced to a hash to keep the log small.
create or replace function private.audit_row() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_old jsonb := case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) end;
  v_new jsonb := case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) end;
  v_row jsonb := coalesce(v_new, v_old);
  v_changed text[];
  v_claims jsonb := (select auth.jwt());
begin
  if v_old ? 'body_markdown' then v_old := v_old || jsonb_build_object('body_markdown', md5(coalesce(v_old->>'body_markdown',''))); end if;
  if v_new ? 'body_markdown' then v_new := v_new || jsonb_build_object('body_markdown', md5(coalesce(v_new->>'body_markdown',''))); end if;
  if tg_op = 'UPDATE' then
    select array_agg(k order by k) into v_changed
      from jsonb_object_keys(v_new) k where v_new->k is distinct from v_old->k;
    if v_changed is null then return null; end if;
  end if;
  insert into public.audit_events (company_id, actor_user_id, actor_type, action, object_type, object_id,
                                   changed_fields, before_data, after_data, correlation_id)
  values ((v_row->>'company_id')::uuid,
          (select auth.uid()),
          case when (select auth.uid()) is null then 'system' else coalesce(v_claims->>'actor_type','user') end,
          tg_op, tg_table_name, coalesce(v_row->>'id', v_row->>'process_id', v_row->>'role_id', ''),
          v_changed, v_old, v_new, v_claims->>'correlation_id');
  return null;
end $$;

-- Attach to organisation/access tables now; domain migrations attach to their own sensitive tables.
create trigger audit_departments      after insert or update or delete on public.departments      for each row execute function private.audit_row();
create trigger audit_memberships      after insert or update or delete on public.memberships      for each row execute function private.audit_row();
create trigger audit_processes        after insert or update or delete on public.processes        for each row execute function private.audit_row();
create trigger audit_roles            after insert or update or delete on public.roles            for each row execute function private.audit_row();
create trigger audit_role_permissions after insert or update or delete on public.role_permissions for each row execute function private.audit_row();
create trigger audit_role_assignments after insert or update or delete on public.role_assignments for each row execute function private.audit_row();

alter table public.audit_events enable row level security;
create policy audit_events_read on public.audit_events for select to authenticated
  using ((select private.has_permission(company_id, 'audit.read')));
-- No insert/update/delete policy: authenticated users can never write audit rows directly.
