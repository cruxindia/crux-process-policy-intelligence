-- PPI-002 Organisation & identity (FR-01) and process catalogue headers (FR-03/FR-07).
-- Tenant-safety pattern: every tenant table has company_id and UNIQUE (company_id, id);
-- children reference parents with composite FKs so cross-company links are impossible.

create table public.companies (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique check (code ~ '^[A-Z0-9][A-Z0-9_-]{1,31}$'),
  name        text not null check (length(trim(name)) > 0),
  timezone    text not null default 'Asia/Kolkata',
  status      text not null default 'active' check (status in ('active','suspended','archived')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table public.legal_entities (
  id          uuid not null default gen_random_uuid() primary key,
  company_id  uuid not null references public.companies(id),
  code        text not null,
  name        text not null,
  entity_type text,                -- recorded as supplied; not inferred (AQ-001)
  status      text not null default 'active' check (status in ('active','inactive')),
  created_at  timestamptz not null default now(),
  unique (company_id, id),
  unique (company_id, code)
);

create table public.locations (
  id                 uuid not null default gen_random_uuid() primary key,
  company_id         uuid not null references public.companies(id),
  code               text not null,
  name               text not null,
  location_type      text not null default 'office'
                     check (location_type in ('head_office','zone','region','branch','office','franchise','other')),
  parent_location_id uuid,
  status             text not null default 'active' check (status in ('active','inactive')),
  created_at         timestamptz not null default now(),
  unique (company_id, id),
  unique (company_id, code),
  foreign key (company_id, parent_location_id) references public.locations(company_id, id)
);

create table public.departments (
  id                   uuid not null default gen_random_uuid() primary key,
  company_id           uuid not null references public.companies(id),
  code                 text not null,
  name                 text not null check (length(trim(name)) > 0),
  parent_department_id uuid,
  mandate              text,
  status               text not null default 'active' check (status in ('active','inactive','archived')),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique (company_id, id),
  unique (company_id, code),
  check (parent_department_id is distinct from id),
  foreign key (company_id, parent_department_id) references public.departments(company_id, id)
);
create index departments_parent_idx on public.departments (company_id, parent_department_id);

-- Global person record keyed to the auth user. Job title lives on membership, never implies permission.
create table public.user_profiles (
  id            uuid primary key references auth.users(id),
  display_name  text not null,
  created_at    timestamptz not null default now()
);

create table public.memberships (
  id                    uuid not null default gen_random_uuid() primary key,
  company_id            uuid not null references public.companies(id),
  user_id               uuid not null references auth.users(id),
  member_kind           text not null default 'human' check (member_kind in ('human','service')),
  job_title             text,
  primary_department_id uuid,
  primary_location_id   uuid,
  is_external           boolean not null default false,
  status                text not null default 'invited' check (status in ('invited','active','suspended','left')),
  valid_from            timestamptz not null default now(),
  valid_to              timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (company_id, id),
  unique (company_id, user_id),
  check (valid_to is null or valid_to > valid_from),
  foreign key (company_id, primary_department_id) references public.departments(company_id, id),
  foreign key (company_id, primary_location_id) references public.locations(company_id, id)
);
create index memberships_user_idx on public.memberships (user_id);
create index memberships_dept_idx on public.memberships (company_id, primary_department_id);

-- Process catalogue header. Structured content lives in process_versions (PPI-007).
create table public.processes (
  id                   uuid not null default gen_random_uuid() primary key,
  company_id           uuid not null references public.companies(id),
  code                 text not null,
  name                 text not null,
  purpose              text,
  owner_department_id  uuid not null,
  owner_membership_id  uuid,
  classification       text not null default 'internal'
                       check (classification in ('public','internal','confidential','restricted')),
  status               text not null default 'candidate'
                       check (status in ('candidate','in_discovery','active','retired')),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique (company_id, id),
  unique (company_id, code),
  foreign key (company_id, owner_department_id) references public.departments(company_id, id),
  foreign key (company_id, owner_membership_id) references public.memberships(company_id, id)
);
create index processes_owner_dept_idx on public.processes (company_id, owner_department_id);

create table public.process_departments (
  company_id    uuid not null,
  process_id    uuid not null,
  department_id uuid not null,
  relation      text not null check (relation in ('participant','upstream','downstream','approver')),
  primary key (company_id, process_id, department_id, relation),
  foreign key (company_id, process_id) references public.processes(company_id, id),
  foreign key (company_id, department_id) references public.departments(company_id, id)
);
create index process_departments_dept_idx on public.process_departments (company_id, department_id);

create trigger companies_updated before update on public.companies for each row execute function private.set_updated_at();
create trigger departments_updated before update on public.departments for each row execute function private.set_updated_at();
create trigger memberships_updated before update on public.memberships for each row execute function private.set_updated_at();
create trigger processes_updated before update on public.processes for each row execute function private.set_updated_at();
