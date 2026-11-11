-- PPI-003 Roles, scoped permissions, delegation, access helpers, RLS for organisation tables (FR-02).
-- Deny by default: no row is visible unless a policy grants it. Job title never grants permission.

create table public.permissions (
  code        text primary key check (code ~ '^[a-z_]+(\.[a-z_]+)+$'),
  description text not null
);

insert into public.permissions (code, description) values
  ('org.manage',                    'Configure company, entities, locations, departments'),
  ('membership.manage',             'Invite/suspend members'),
  ('role.manage',                   'Define roles and assign scoped roles'),
  ('process.read',                  'Read process catalogue and versions'),
  ('process.edit',                  'Create/edit draft process data'),
  ('process.approve',               'Approve a process version'),
  ('interview.manage',              'Create campaigns and assignments'),
  ('interview.review',              'Review submitted interviews'),
  ('evidence.read',                 'Read evidence metadata/files'),
  ('evidence.upload',               'Upload evidence'),
  ('evidence.review',               'Review evidence relevance'),
  ('knowledge.read',                'Read knowledge records'),
  ('knowledge.edit',                'Create/edit draft knowledge records and source links'),
  ('knowledge.verify',              'Verify factual records'),
  ('knowledge.approve',             'Formally approve knowledge records'),
  ('clarification.create',          'Raise clarification tasks'),
  ('clarification.respond',         'Respond to clarification tasks assigned to a department in scope'),
  ('clarification.manage',          'Reassign/escalate/cancel clarification tasks'),
  ('dispute.raise',                 'Raise disputes and add positions'),
  ('dispute.decide',                'Decide disputes within scope'),
  ('document.read',                 'Read published controlled documents'),
  ('document.draft',                'Draft controlled documents'),
  ('document.review_owner',         'Owner review of documents'),
  ('document.review_functional',    'Cross-functional review'),
  ('document.review_risk',          'Risk review'),
  ('document.review_legal',         'Legal/compliance review'),
  ('document.approve',              'Approve controlled documents'),
  ('document.publish',              'Publish approved documents'),
  ('document.emergency_publish',    'Emergency publication with reason and retrospective review'),
  ('classified.confidential_read',  'Read confidential-classified records in scope'),
  ('classified.restricted_read',    'Read restricted-classified records in scope'),
  ('audit.read',                    'Read audit events'),
  ('ai.run',                        'Request AI runs'),
  ('dashboard.read',                'Read dashboards');

create table public.roles (
  id          uuid not null default gen_random_uuid() primary key,
  company_id  uuid not null references public.companies(id),
  code        text not null,
  name        text not null,
  description text,
  is_candidate boolean not null default true,   -- candidate role until CRUX confirms authority matrix (AQ-005)
  created_at  timestamptz not null default now(),
  unique (company_id, id),
  unique (company_id, code)
);

create table public.role_permissions (
  company_id      uuid not null,
  role_id         uuid not null,
  permission_code text not null references public.permissions(code),
  primary key (company_id, role_id, permission_code),
  foreign key (company_id, role_id) references public.roles(company_id, id) on delete cascade
);

create table public.role_assignments (
  id                       uuid not null default gen_random_uuid() primary key,
  company_id               uuid not null,
  membership_id            uuid not null,
  role_id                  uuid not null,
  scope_type               text not null check (scope_type in ('company','department','process')),
  scope_department_id      uuid,
  scope_process_id         uuid,
  valid_from               timestamptz not null default now(),
  valid_to                 timestamptz,
  status                   text not null default 'active' check (status in ('active','revoked')),
  delegated_from_id        uuid,     -- temporary delegation: source assignment
  delegation_reason        text,
  granted_by_membership_id uuid,
  created_at               timestamptz not null default now(),
  unique (company_id, id),
  foreign key (company_id, membership_id) references public.memberships(company_id, id),
  foreign key (company_id, role_id) references public.roles(company_id, id),
  foreign key (company_id, scope_department_id) references public.departments(company_id, id),
  foreign key (company_id, scope_process_id) references public.processes(company_id, id),
  foreign key (company_id, delegated_from_id) references public.role_assignments(company_id, id),
  foreign key (company_id, granted_by_membership_id) references public.memberships(company_id, id),
  check ((scope_type = 'company'    and scope_department_id is null and scope_process_id is null)
      or (scope_type = 'department' and scope_department_id is not null and scope_process_id is null)
      or (scope_type = 'process'    and scope_process_id is not null and scope_department_id is null)),
  check (valid_to is null or valid_to > valid_from),
  check (delegated_from_id is null or (valid_to is not null and coalesce(length(trim(delegation_reason)),0) > 0))
);
create index role_assignments_member_idx on public.role_assignments (company_id, membership_id) where status = 'active';
create index role_assignments_role_idx on public.role_assignments (company_id, role_id);

-- ---------------------------------------------------------------------------
-- Access helpers (SECURITY DEFINER, fixed search_path, private schema)
-- ---------------------------------------------------------------------------

-- Active membership of the calling user in a company (human or service).
create or replace function private.my_membership(p_company uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select m.id from public.memberships m
  where m.company_id = p_company and m.user_id = (select auth.uid())
    and m.status = 'active' and m.valid_from <= now() and (m.valid_to is null or m.valid_to > now())
$$;

create or replace function private.is_active_member(p_company uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.my_membership(p_company) is not null
$$;

-- True only for a human member whose token is not marked as an AI/service actor.
create or replace function private.is_human_actor(p_company uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.memberships m
    where m.id = private.my_membership(p_company) and m.member_kind = 'human'
  ) and coalesce((select auth.jwt()) ->> 'actor_type', 'user') = 'user'
$$;

-- The department and all its ancestors (a department-scoped role on a parent covers children).
create or replace function private.department_lineage(p_company uuid, p_department uuid) returns setof uuid
language sql stable security definer set search_path = '' as $$
  with recursive up as (
    select d.id, d.parent_department_id, 1 as depth from public.departments d
     where d.company_id = p_company and d.id = p_department
    union all
    select d.id, d.parent_department_id, up.depth + 1 from public.departments d
      join up on d.id = up.parent_department_id and d.company_id = p_company
     where up.depth < 20
  )
  select id from up
$$;

-- Core permission check. Scope resolution:
--   company-scoped assignment → always applies;
--   department-scoped → applies when it covers p_department, or the owning department of p_process;
--   process-scoped → applies to p_process only.
create or replace function private.has_permission(p_company uuid, p_perm text, p_department uuid default null, p_process uuid default null)
returns boolean
language sql stable security definer set search_path = '' as $$
  with me as (select private.my_membership(p_company) as id),
  target_dept as (
    select coalesce(p_department,
      (select p.owner_department_id from public.processes p where p.company_id = p_company and p.id = p_process)) as id
  ),
  covering as (
    select private.department_lineage(p_company, (select id from target_dept)) as id
  )
  select exists (
    select 1
      from public.role_assignments ra
      join public.role_permissions rp
        on rp.company_id = ra.company_id and rp.role_id = ra.role_id and rp.permission_code = p_perm
     where ra.company_id = p_company
       and ra.membership_id = (select id from me)
       and ra.status = 'active' and ra.valid_from <= now() and (ra.valid_to is null or ra.valid_to > now())
       and (   ra.scope_type = 'company'
            or (ra.scope_type = 'department' and ra.scope_department_id in (select id from covering))
            or (ra.scope_type = 'process' and p_process is not null and ra.scope_process_id = p_process))
  )
$$;

-- Read rule = domain permission in scope + clearance for classified rows.
create or replace function private.can_read(p_company uuid, p_perm text, p_department uuid, p_process uuid, p_classification text)
returns boolean
language sql stable security definer set search_path = '' as $$
  select private.has_permission(p_company, p_perm, p_department, p_process)
     and case p_classification
           when 'confidential' then private.has_permission(p_company, 'classified.confidential_read', p_department, p_process)
           when 'restricted'   then private.has_permission(p_company, 'classified.restricted_read', p_department, p_process)
           else true end
$$;

-- Process read = process.read in scope + clearance for the process classification.
create or replace function private.can_read_process(p_company uuid, p_process uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.processes p where p.company_id = p_company and p.id = p_process
                 and private.can_read(p_company, 'process.read', p.owner_department_id, p.id, p.classification))
$$;

-- Do two users share an active company? (profile visibility)
create or replace function private.shares_company(p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.memberships a join public.memberships b on a.company_id = b.company_id
     where a.user_id = (select auth.uid()) and a.status = 'active' and b.user_id = p_user
  )
$$;

revoke all on all functions in schema private from public;
grant execute on all functions in schema private to authenticated, service_role;

-- Assignment guard: no self-granting; delegation only of a role the delegator holds.
create or replace function private.role_assignment_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := private.my_membership(new.company_id);
begin
  if (select auth.uid()) is not null then
    if v_actor = new.membership_id then
      raise exception 'PPI_SOD: a member cannot grant a role to themselves' using errcode = 'P0001';
    end if;
    new.granted_by_membership_id := v_actor;
  end if;
  if new.delegated_from_id is not null and not exists (
      select 1 from public.role_assignments s
       where s.company_id = new.company_id and s.id = new.delegated_from_id
         and s.role_id = new.role_id and s.status = 'active'
         and s.membership_id = coalesce(v_actor, new.granted_by_membership_id)) then
    raise exception 'PPI_DELEGATION: delegator must hold the delegated role' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger role_assignments_guard before insert or update on public.role_assignments
  for each row execute function private.role_assignment_guard();

-- ---------------------------------------------------------------------------
-- RLS for organisation & access-control tables
-- ---------------------------------------------------------------------------
alter table public.companies          enable row level security;
alter table public.legal_entities     enable row level security;
alter table public.locations          enable row level security;
alter table public.departments        enable row level security;
alter table public.user_profiles      enable row level security;
alter table public.memberships        enable row level security;
alter table public.processes          enable row level security;
alter table public.process_departments enable row level security;
alter table public.permissions        enable row level security;
alter table public.roles              enable row level security;
alter table public.role_permissions   enable row level security;
alter table public.role_assignments   enable row level security;

create policy companies_read on public.companies for select to authenticated
  using ((select private.is_active_member(id)));
create policy companies_update on public.companies for update to authenticated
  using ((select private.has_permission(id, 'org.manage'))) with check ((select private.has_permission(id, 'org.manage')));

create policy legal_entities_read on public.legal_entities for select to authenticated using ((select private.is_active_member(company_id)));
create policy legal_entities_write on public.legal_entities for insert to authenticated with check ((select private.has_permission(company_id, 'org.manage')));
create policy legal_entities_update on public.legal_entities for update to authenticated
  using ((select private.has_permission(company_id, 'org.manage'))) with check ((select private.has_permission(company_id, 'org.manage')));

create policy locations_read on public.locations for select to authenticated using ((select private.is_active_member(company_id)));
create policy locations_write on public.locations for insert to authenticated with check ((select private.has_permission(company_id, 'org.manage')));
create policy locations_update on public.locations for update to authenticated
  using ((select private.has_permission(company_id, 'org.manage'))) with check ((select private.has_permission(company_id, 'org.manage')));

create policy departments_read on public.departments for select to authenticated using ((select private.is_active_member(company_id)));
create policy departments_write on public.departments for insert to authenticated with check ((select private.has_permission(company_id, 'org.manage')));
create policy departments_update on public.departments for update to authenticated
  using ((select private.has_permission(company_id, 'org.manage'))) with check ((select private.has_permission(company_id, 'org.manage')));

create policy user_profiles_read on public.user_profiles for select to authenticated
  using (id = (select auth.uid()) or (select private.shares_company(id)));
create policy user_profiles_self on public.user_profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy memberships_read on public.memberships for select to authenticated using ((select private.is_active_member(company_id)));
create policy memberships_write on public.memberships for insert to authenticated with check ((select private.has_permission(company_id, 'membership.manage')));
create policy memberships_update on public.memberships for update to authenticated
  using ((select private.has_permission(company_id, 'membership.manage'))) with check ((select private.has_permission(company_id, 'membership.manage')));

create policy processes_read on public.processes for select to authenticated
  using ((select private.can_read(company_id, 'process.read', owner_department_id, id, classification)));
create policy processes_insert on public.processes for insert to authenticated
  with check ((select private.has_permission(company_id, 'process.edit', owner_department_id)));
create policy processes_update on public.processes for update to authenticated
  using ((select private.has_permission(company_id, 'process.edit', owner_department_id, id)))
  with check ((select private.has_permission(company_id, 'process.edit', owner_department_id, id)));

create policy process_departments_read on public.process_departments for select to authenticated
  using ((select private.can_read_process(company_id, process_id)));
create policy process_departments_write on public.process_departments for insert to authenticated
  with check ((select private.has_permission(company_id, 'process.edit', null, process_id)));

create policy permissions_read on public.permissions for select to authenticated using (true);

create policy roles_read on public.roles for select to authenticated using ((select private.is_active_member(company_id)));
create policy roles_write on public.roles for insert to authenticated with check ((select private.has_permission(company_id, 'role.manage')));
create policy role_permissions_read on public.role_permissions for select to authenticated using ((select private.is_active_member(company_id)));
create policy role_permissions_write on public.role_permissions for insert to authenticated with check ((select private.has_permission(company_id, 'role.manage')));

create policy role_assignments_read on public.role_assignments for select to authenticated
  using (membership_id = (select private.my_membership(company_id))
         or (select private.has_permission(company_id, 'role.manage')));
create policy role_assignments_insert on public.role_assignments for insert to authenticated
  with check ((select private.has_permission(company_id, 'role.manage')));
create policy role_assignments_update on public.role_assignments for update to authenticated
  using ((select private.has_permission(company_id, 'role.manage'))) with check ((select private.has_permission(company_id, 'role.manage')));
