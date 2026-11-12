-- PPI-024: AI-led discovery (Master Corrective Prompt v2.0, Parts 3-4, 8).
-- One continuous AI conversation per employee: person -> responsibilities -> process inventory -> each process in depth.
-- Raw answers stay in interview_answers (append-only). Everything below is AI-derived, service-written, user-readable,
-- and never treated as approved knowledge until a human reviews it.

alter table public.interview_campaigns drop constraint interview_campaigns_interview_mode_check;
alter table public.interview_campaigns add constraint interview_campaigns_interview_mode_check
  check (interview_mode in ('fixed', 'adaptive', 'discovery'));

-- Profile + responsibilities as understood so far (one row per session).
create table public.discovery_profiles (
  company_id          uuid not null references public.companies(id),
  session_id          uuid not null,
  membership_id       uuid not null,
  profile             jsonb not null default '{}'::jsonb,   -- field -> {value, source_ref, updated_at}
  responsibilities    jsonb not null default '[]'::jsonb,   -- [{name, kind, note, source_ref}]
  inventory_confirmed boolean not null default false,       -- employee confirmed nothing else to add
  stage               text not null default 'person'
                      check (stage in ('person', 'responsibilities', 'inventory', 'process_deep_dive', 'wrap_up')),
  focus_process_key   text,
  last_ai_run_id      uuid,
  updated_at          timestamptz not null default now(),
  primary key (company_id, session_id),
  foreign key (company_id, session_id) references public.interview_sessions(company_id, id),
  foreign key (company_id, membership_id) references public.memberships(company_id, id),
  foreign key (company_id, last_ai_run_id) references public.ai_runs(company_id, id)
);
create index dp_membership_idx on public.discovery_profiles (company_id, membership_id);
create index dp_run_idx on public.discovery_profiles (company_id, last_ai_run_id);

-- Process inventory discovered in the conversation, with the live flowchart.
create table public.discovered_processes (
  id                 uuid not null default gen_random_uuid() primary key,
  company_id         uuid not null references public.companies(id),
  session_id         uuid not null,
  membership_id      uuid not null,
  process_key        text not null check (process_key ~ '^[a-z0-9][a-z0-9_-]{1,60}$'),
  name               text not null check (length(name) between 2 and 160),
  purpose            text,
  involvement        text check (involvement in ('execute', 'manage', 'review', 'approve', 'mixed')),
  owner_text         text,
  importance         text check (importance in ('high', 'medium', 'low')),
  frequency          text,
  volume             text,
  departments        text[] not null default '{}',
  status             text not null default 'identified' check (status in ('identified', 'in_discovery', 'sufficient', 'removed')),
  completeness       smallint not null default 0 check (completeness between 0 and 100),
  coverage           jsonb not null default '{}'::jsonb,   -- dimension -> not_started|partial|sufficient
  flow               jsonb not null default '{"nodes":[],"edges":[]}'::jsonb,
  flow_version       integer not null default 0,
  linked_process_id  uuid,                                  -- set by a reviewer when mapped to the governed process register
  first_ai_run_id    uuid,
  last_ai_run_id     uuid,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (company_id, id),
  unique (company_id, session_id, process_key),
  foreign key (company_id, session_id) references public.interview_sessions(company_id, id),
  foreign key (company_id, membership_id) references public.memberships(company_id, id),
  foreign key (company_id, linked_process_id) references public.processes(company_id, id),
  foreign key (company_id, first_ai_run_id) references public.ai_runs(company_id, id),
  foreign key (company_id, last_ai_run_id) references public.ai_runs(company_id, id)
);
create index dpr_membership_idx on public.discovered_processes (company_id, membership_id);
create index dpr_linked_idx on public.discovered_processes (company_id, linked_process_id);
create index dpr_first_run_idx on public.discovered_processes (company_id, first_ai_run_id);
create index dpr_last_run_idx on public.discovered_processes (company_id, last_ai_run_id);

-- Every flowchart version is kept (append-only), so changes are traceable to the AI run and the answers behind it.
create table public.discovered_process_flows (
  id          uuid not null default gen_random_uuid() primary key,
  company_id  uuid not null references public.companies(id),
  process_id  uuid not null,
  version     integer not null check (version > 0),
  flow        jsonb not null,
  ai_run_id   uuid not null,
  created_at  timestamptz not null default now(),
  unique (process_id, version),
  foreign key (company_id, process_id) references public.discovered_processes(company_id, id),
  foreign key (company_id, ai_run_id) references public.ai_runs(company_id, id)
);
create index dpf_run_idx on public.discovered_process_flows (company_id, ai_run_id);
create index dpf_process_idx on public.discovered_process_flows (company_id, process_id);
create trigger dpf_append_only before update or delete on public.discovered_process_flows
  for each row execute function private.forbid_mutation();
create trigger dpr_no_delete before delete on public.discovered_processes
  for each row execute function private.forbid_mutation();

alter table public.discovery_profiles enable row level security;
alter table public.discovered_processes enable row level security;
alter table public.discovered_process_flows enable row level security;
create policy dp_read on public.discovery_profiles for select to authenticated
  using ((select private.can_read_session(company_id, session_id)));
create policy dpr_read on public.discovered_processes for select to authenticated
  using ((select private.can_read_session(company_id, session_id)));
create policy dpf_read on public.discovered_process_flows for select to authenticated
  using (exists (select 1 from public.discovered_processes p
                  where p.company_id = discovered_process_flows.company_id and p.id = discovered_process_flows.process_id
                    and (select private.can_read_session(p.company_id, p.session_id))));
-- AI artefacts are written by the server only.
revoke insert, update, delete, truncate, references, trigger on public.discovery_profiles, public.discovered_processes,
       public.discovered_process_flows from authenticated;
revoke all on public.discovery_profiles, public.discovered_processes, public.discovered_process_flows from anon;

create trigger audit_discovered_processes after insert or update on public.discovered_processes
  for each row execute function private.audit_row();
