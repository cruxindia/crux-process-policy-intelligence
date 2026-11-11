-- PPI-007 Structured process versions, steps, edges and map validation (FR-07, FR-11).
-- The map is generated from this structured data; a diagram is never the system of record.

create table public.process_versions (
  id                    uuid not null default gen_random_uuid() primary key,
  company_id            uuid not null,
  process_id            uuid not null,
  version_no            int  not null check (version_no > 0),
  state_kind            text not null check (state_kind in ('as_is','to_be')),
  status                text not null default 'draft'
                        check (status in ('draft','under_review','approved','active','superseded','retired','rejected')),
  based_on_version_id   uuid,
  trigger_text          text,
  start_event           text,
  end_event             text,
  frequency_text        text,
  volume_text           text,
  customer_text         text,
  output_text           text,
  change_summary        text,
  created_by_membership_id  uuid,
  approved_by_membership_id uuid,
  approved_at           timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (company_id, id),
  unique (company_id, process_id, version_no),
  foreign key (company_id, process_id) references public.processes(company_id, id),
  foreign key (company_id, based_on_version_id) references public.process_versions(company_id, id),
  foreign key (company_id, created_by_membership_id) references public.memberships(company_id, id),
  foreign key (company_id, approved_by_membership_id) references public.memberships(company_id, id)
);
-- At most one active AS-IS and one active TO-BE version per process.
create unique index process_versions_one_active on public.process_versions (company_id, process_id, state_kind) where status = 'active';

create table public.process_steps (
  id                    uuid not null default gen_random_uuid() primary key,
  company_id            uuid not null,
  process_version_id    uuid not null,
  step_code             text not null,
  seq                   int  not null,
  step_type             text not null check (step_type in ('start','end','activity','decision','handoff','wait','subprocess',
                                                           'exception','control','system','record')),
  name                  text not null,
  description           text,
  actor_role_text       text,              -- role as described, e.g. "Branch coordinator"
  performer_department_id uuid,
  system_name           text,
  sla_text              text,
  subprocess_id         uuid,
  is_assumption         boolean not null default false,   -- unverified, shown distinctly on the map
  created_at            timestamptz not null default now(),
  unique (company_id, id),
  unique (company_id, process_version_id, id),
  unique (company_id, process_version_id, step_code),
  foreign key (company_id, process_version_id) references public.process_versions(company_id, id) on delete cascade,
  foreign key (company_id, performer_department_id) references public.departments(company_id, id),
  foreign key (company_id, subprocess_id) references public.processes(company_id, id)
);

create table public.process_edges (
  id                 uuid not null default gen_random_uuid() primary key,
  company_id         uuid not null,
  process_version_id uuid not null,
  from_step_id       uuid not null,
  to_step_id         uuid not null,
  edge_type          text not null default 'sequence' check (edge_type in ('sequence','decision_branch','exception','loop','handoff')),
  condition_label    text,
  created_at         timestamptz not null default now(),
  unique (company_id, id),
  unique (company_id, process_version_id, from_step_id, to_step_id, condition_label),
  -- both ends must belong to the SAME process version
  foreign key (company_id, process_version_id, from_step_id) references public.process_steps(company_id, process_version_id, id) on delete cascade,
  foreign key (company_id, process_version_id, to_step_id) references public.process_steps(company_id, process_version_id, id) on delete cascade,
  check (edge_type <> 'decision_branch' or coalesce(length(trim(condition_label)),0) > 0)
);

-- Source link per significant element (step → knowledge record).
create table public.process_step_sources (
  company_id          uuid not null,
  process_step_id     uuid not null,
  knowledge_record_id uuid not null,
  created_at          timestamptz not null default now(),
  primary key (company_id, process_step_id, knowledge_record_id),
  foreign key (company_id, process_step_id) references public.process_steps(company_id, id) on delete cascade,
  foreign key (company_id, knowledge_record_id) references public.knowledge_records(company_id, id)
);

-- Guards ---------------------------------------------------------------------------
create or replace function private.process_version_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if new.status <> 'draft' then raise exception 'PPI_LIFECYCLE: process versions start as draft' using errcode = 'P0001'; end if;
    if (select auth.uid()) is not null then new.created_by_membership_id := private.my_membership(new.company_id); end if;
    return new;
  end if;
  if old.status <> 'draft' and (new.trigger_text, new.start_event, new.end_event, new.frequency_text, new.volume_text,
                                new.customer_text, new.output_text, new.state_kind, new.process_id, new.version_no)
                     is distinct from (old.trigger_text, old.start_event, old.end_event, old.frequency_text, old.volume_text,
                                       old.customer_text, old.output_text, old.state_kind, old.process_id, old.version_no) then
    raise exception 'PPI_IMMUTABLE: only draft process versions can be edited; create a new version' using errcode = 'P0001';
  end if;
  perform private.assert_transition('process_version', old.status, new.status, array[
    'draft>under_review','under_review>draft','under_review>approved','under_review>rejected',
    'approved>active','active>superseded','approved>superseded','active>retired','draft>retired']);
  if new.status = 'approved' and old.status <> 'approved' then
    if not private.is_human_actor(new.company_id)
       or not private.has_permission(new.company_id, 'process.approve', null, new.process_id) then
      raise exception 'PPI_HUMAN_ONLY: process approval requires a human with process.approve in scope' using errcode = 'P0001';
    end if;
    new.approved_by_membership_id := private.my_membership(new.company_id);
    new.approved_at := now();
  end if;
  -- activating a version supersedes the previously active one of the same kind
  if new.status = 'active' and old.status <> 'active' then
    update public.process_versions set status = 'superseded'
     where company_id = new.company_id and process_id = new.process_id and state_kind = new.state_kind
       and status = 'active' and id <> new.id;
  end if;
  return new;
end $$;
create trigger process_versions_guard before insert or update on public.process_versions
  for each row execute function private.process_version_guard();
create trigger process_versions_updated before update on public.process_versions for each row execute function private.set_updated_at();
create trigger process_versions_no_delete before delete on public.process_versions for each row execute function private.forbid_mutation();

-- Steps/edges/sources may change only while their version is draft.
create or replace function private.process_child_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_version uuid; v_status text; v_company uuid := coalesce(new.company_id, old.company_id);
begin
  if tg_table_name = 'process_step_sources' then
    select s.process_version_id into v_version from public.process_steps s
     where s.company_id = v_company and s.id = coalesce(new.process_step_id, old.process_step_id);
  else
    v_version := coalesce(new.process_version_id, old.process_version_id);
  end if;
  select status into v_status from public.process_versions where company_id = v_company and id = v_version;
  if v_status is distinct from 'draft' then
    raise exception 'PPI_IMMUTABLE: % of a % process version cannot change', tg_table_name, v_status using errcode = 'P0001';
  end if;
  return coalesce(new, old);
end $$;
create trigger process_steps_guard before insert or update or delete on public.process_steps for each row execute function private.process_child_guard();
create trigger process_edges_guard before insert or update or delete on public.process_edges for each row execute function private.process_child_guard();
create trigger process_step_sources_guard before insert or update or delete on public.process_step_sources for each row execute function private.process_child_guard();

create trigger audit_process_versions after insert or update on public.process_versions for each row execute function private.audit_row();

create or replace function private.version_process(p_company uuid, p_version uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select process_id from public.process_versions where company_id = p_company and id = p_version
$$;
create or replace function private.step_version(p_company uuid, p_step uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select process_version_id from public.process_steps where company_id = p_company and id = p_step
$$;
grant execute on all functions in schema private to authenticated, service_role;

-- Map validation (FR-11): returns structural issues; respects RLS (security invoker).
create or replace function public.process_map_issues(p_version uuid)
returns table (issue_type text, step_id uuid, step_code text, detail text)
language sql stable security invoker set search_path = '' as $$
  with s as (select * from public.process_steps where process_version_id = p_version),
       e as (select * from public.process_edges where process_version_id = p_version),
       reach as (
         with recursive r(id) as (
           select id from s where step_type = 'start'
           union
           select e.to_step_id from e join r on e.from_step_id = r.id)
         select id from r)
  select 'missing_start', null::uuid, null, 'No start step' where not exists (select 1 from s where step_type = 'start')
  union all
  select 'missing_end', null, null, 'No end step' where not exists (select 1 from s where step_type = 'end')
  union all
  select 'orphan_step', s.id, s.step_code, 'Step has no incoming or outgoing flow' from s
   where not exists (select 1 from e where e.from_step_id = s.id or e.to_step_id = s.id)
  union all
  select 'no_outgoing', s.id, s.step_code, 'Non-end step has no outgoing flow' from s
   where s.step_type <> 'end' and not exists (select 1 from e where e.from_step_id = s.id)
     and exists (select 1 from e where e.to_step_id = s.id)
  union all
  select 'unreachable', s.id, s.step_code, 'Not reachable from start' from s
   where exists (select 1 from s where step_type = 'start') and s.id not in (select id from reach)
  union all
  select 'decision_branches', s.id, s.step_code, 'Decision needs at least two labelled branches' from s
   where s.step_type = 'decision'
     and (select count(*) from e where e.from_step_id = s.id and e.edge_type = 'decision_branch') < 2
  union all
  select 'missing_owner', s.id, s.step_code, 'Activity has no actor role or performing department' from s
   where s.step_type in ('activity','decision','handoff','control') and s.actor_role_text is null and s.performer_department_id is null
  union all
  select 'missing_output', null, null, 'Process version has no defined output'
   where exists (select 1 from public.process_versions v where v.id = p_version and v.output_text is null)
  union all
  select 'unverified_assumption', s.id, s.step_code, 'Step is an unverified assumption' from s where s.is_assumption
  union all
  select 'unsourced_step', s.id, s.step_code, 'Step has no linked knowledge source' from s
   where s.step_type not in ('start','end')
     and not exists (select 1 from public.process_step_sources ps where ps.process_step_id = s.id)
$$;

alter table public.process_versions     enable row level security;
alter table public.process_steps        enable row level security;
alter table public.process_edges        enable row level security;
alter table public.process_step_sources enable row level security;

create policy pv_read on public.process_versions for select to authenticated
  using ((select private.can_read_process(company_id, process_id)));
create policy pv_insert on public.process_versions for insert to authenticated
  with check ((select private.has_permission(company_id, 'process.edit', null, process_id)));
create policy pv_update on public.process_versions for update to authenticated
  using ((select private.has_permission(company_id, 'process.edit', null, process_id))
      or (select private.has_permission(company_id, 'process.approve', null, process_id)))
  with check ((select private.has_permission(company_id, 'process.edit', null, process_id))
      or (select private.has_permission(company_id, 'process.approve', null, process_id)));

create policy ps_read on public.process_steps for select to authenticated
  using ((select private.can_read_process(company_id, private.version_process(company_id, process_version_id))));
create policy ps_write on public.process_steps for all to authenticated
  using ((select private.has_permission(company_id, 'process.edit', null, private.version_process(company_id, process_version_id))))
  with check ((select private.has_permission(company_id, 'process.edit', null, private.version_process(company_id, process_version_id))));

create policy pe_read on public.process_edges for select to authenticated
  using ((select private.can_read_process(company_id, private.version_process(company_id, process_version_id))));
create policy pe_write on public.process_edges for all to authenticated
  using ((select private.has_permission(company_id, 'process.edit', null, private.version_process(company_id, process_version_id))))
  with check ((select private.has_permission(company_id, 'process.edit', null, private.version_process(company_id, process_version_id))));

create policy pss_read on public.process_step_sources for select to authenticated
  using ((select private.can_read_process(company_id,
            private.version_process(company_id, private.step_version(company_id, process_step_id)))));
create policy pss_write on public.process_step_sources for all to authenticated
  using ((select private.has_permission(company_id, 'process.edit', null,
            private.version_process(company_id, private.step_version(company_id, process_step_id)))))
  with check ((select private.has_permission(company_id, 'process.edit', null,
            private.version_process(company_id, private.step_version(company_id, process_step_id))))
          and (select private.can_read_knowledge(company_id, knowledge_record_id)));
