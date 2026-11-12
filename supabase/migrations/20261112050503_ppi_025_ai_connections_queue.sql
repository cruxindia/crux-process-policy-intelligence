-- PPI-025: multiple AI project connections (Master Corrective Prompt v2.0, Parts 5-7).
-- * Up to N Gemini (or Ollama) connections per company, each tied to an approved provider policy.
-- * API keys live ONLY in Supabase Vault; tables hold the Vault secret id. Decryption is reachable only by service_role.
-- * Routing by department / process / interview category with priority + fallback; cooldowns from real provider errors.
-- * A saved-work queue so no answer is lost when no provider can run.

create table public.ai_provider_connections (
  id                 uuid not null default gen_random_uuid() primary key,
  company_id         uuid not null references public.companies(id),
  name               text not null check (length(name) between 2 and 80),
  provider           text not null check (provider in ('gemini', 'ollama')),
  policy_provider    text not null,                         -- must match an ai_provider_policies.provider (e.g. gemini_free)
  gcp_project_id     text check (gcp_project_id is null or gcp_project_id ~ '^[a-z0-9:._-]{3,64}$'),
  model              text not null default 'gemini-flash-lite-latest' check (length(model) between 3 and 80),
  base_url           text check (base_url is null or base_url ~ '^https?://'),   -- Ollama only
  priority           smallint not null default 100 check (priority between 1 and 1000),
  status             text not null default 'active' check (status in ('active', 'disabled')),
  vault_secret_id    uuid,                                   -- Vault reference; the key itself is never stored here
  key_set_at         timestamptz,
  health             text not null default 'untested'
                     check (health in ('untested', 'not_configured', 'configured', 'connected', 'auth_failed',
                                       'model_unavailable', 'rate_limited', 'provider_error')),
  last_tested_at     timestamptz,
  last_success_at    timestamptz,
  last_error_class   text,
  last_error_at      timestamptz,
  cooldown_until     timestamptz,                            -- set from the provider's own retry info
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (company_id, id),
  unique (company_id, name),
  foreign key (company_id, policy_provider) references public.ai_provider_policies(company_id, provider)
);
create index apc_policy_idx on public.ai_provider_connections (company_id, policy_provider);

create table public.ai_connection_assignments (
  id                 uuid not null default gen_random_uuid() primary key,
  company_id         uuid not null references public.companies(id),
  connection_id      uuid not null,
  department_id      uuid,
  process_id         uuid,
  interview_category text check (interview_category is null or interview_category in ('discovery', 'adaptive', 'review', 'documents')),
  active             boolean not null default true,          -- no hard deletes: deactivate instead (audited)
  created_at         timestamptz not null default now(),
  unique (company_id, connection_id, department_id, process_id, interview_category),
  foreign key (company_id, connection_id) references public.ai_provider_connections(company_id, id),
  foreign key (company_id, department_id) references public.departments(company_id, id),
  foreign key (company_id, process_id) references public.processes(company_id, id)
);
create index aca_conn_idx on public.ai_connection_assignments (company_id, connection_id);
create index aca_dept_idx on public.ai_connection_assignments (company_id, department_id);
create index aca_proc_idx on public.ai_connection_assignments (company_id, process_id);

-- Configurable connection limit (Part 6: 10 initially).
alter table public.companies add column ai_connection_limit smallint not null default 10 check (ai_connection_limit between 1 and 50);
create or replace function private.ai_connection_limit_guard() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (select count(*) from public.ai_provider_connections where company_id = new.company_id)
     >= (select ai_connection_limit from public.companies where id = new.company_id) then
    raise exception 'PPI_LIMIT: this company already has the maximum number of AI connections' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger apc_limit before insert on public.ai_provider_connections for each row execute function private.ai_connection_limit_guard();
create trigger apc_updated before update on public.ai_provider_connections for each row execute function private.set_updated_at();

-- Which connection served each AI run (usage monitoring).
alter table public.ai_runs add column connection_id uuid;
alter table public.ai_runs add constraint ai_runs_connection_fkey foreign key (company_id, connection_id) references public.ai_provider_connections(company_id, id);
create index ai_runs_connection_idx on public.ai_runs (company_id, connection_id);

-- Saved-work queue (Part 7).
create table public.ai_jobs (
  id               uuid not null default gen_random_uuid() primary key,
  company_id       uuid not null references public.companies(id),
  membership_id    uuid,
  session_id       uuid,
  process_id       uuid,
  connection_id    uuid,
  task_type        text not null check (task_type in ('discovery_turn', 'adaptive_turn', 'document_draft')),
  payload_ref      jsonb not null default '{}'::jsonb,       -- references only (ids/fingerprints), never answer text
  priority         smallint not null default 100,
  status           text not null default 'queued' check (status in ('queued', 'running', 'done', 'failed', 'cancelled')),
  retry_count      integer not null default 0,
  run_after        timestamptz not null default now(),
  idempotency_key  text not null,
  error_class      text,
  created_at       timestamptz not null default now(),
  started_at       timestamptz,
  completed_at     timestamptz,
  unique (company_id, idempotency_key),
  foreign key (company_id, membership_id) references public.memberships(company_id, id),
  foreign key (company_id, session_id) references public.interview_sessions(company_id, id),
  foreign key (company_id, process_id) references public.discovered_processes(company_id, id),
  foreign key (company_id, connection_id) references public.ai_provider_connections(company_id, id)
);
create index aj_due_idx on public.ai_jobs (company_id, status, run_after);
create index aj_member_idx on public.ai_jobs (company_id, membership_id);
create index aj_session_idx on public.ai_jobs (company_id, session_id);
create index aj_process_idx on public.ai_jobs (company_id, process_id);
create index aj_conn_idx on public.ai_jobs (company_id, connection_id);

-- RLS: administrators (org.manage) manage connections/assignments; the key column is a reference, not a secret.
alter table public.ai_provider_connections enable row level security;
alter table public.ai_connection_assignments enable row level security;
alter table public.ai_jobs enable row level security;
create policy apc_admin_read on public.ai_provider_connections for select to authenticated using ((select private.has_permission(company_id, 'org.manage')));
create policy apc_admin_ins on public.ai_provider_connections for insert to authenticated with check ((select private.has_permission(company_id, 'org.manage')) and vault_secret_id is null);
create policy apc_admin_upd on public.ai_provider_connections for update to authenticated
  using ((select private.has_permission(company_id, 'org.manage'))) with check ((select private.has_permission(company_id, 'org.manage')));
create policy aca_admin_read on public.ai_connection_assignments for select to authenticated using ((select private.has_permission(company_id, 'org.manage')));
create policy aca_admin_ins on public.ai_connection_assignments for insert to authenticated with check ((select private.has_permission(company_id, 'org.manage')));
create policy aca_admin_upd on public.ai_connection_assignments for update to authenticated
  using ((select private.has_permission(company_id, 'org.manage'))) with check ((select private.has_permission(company_id, 'org.manage')));
create policy aj_read on public.ai_jobs for select to authenticated
  using ((select private.has_permission(company_id, 'org.manage'))
         or membership_id = (select private.my_membership(company_id)));
-- Only the server may set the Vault reference or health fields: browsers get column-limited UPDATE; no deletes.
revoke update, delete, truncate, references, trigger on public.ai_provider_connections from authenticated;
grant update (name, provider, policy_provider, gcp_project_id, model, base_url, priority, status) on public.ai_provider_connections to authenticated;
revoke insert on public.ai_provider_connections from authenticated;
grant insert (id, company_id, name, provider, policy_provider, gcp_project_id, model, base_url, priority, status) on public.ai_provider_connections to authenticated;
revoke update, delete, truncate, references, trigger on public.ai_connection_assignments from authenticated;
grant update (active) on public.ai_connection_assignments to authenticated;
revoke insert, update, delete, truncate, references, trigger on public.ai_jobs from authenticated;
revoke all on public.ai_provider_connections, public.ai_connection_assignments, public.ai_jobs from anon;
create trigger audit_ai_provider_connections after insert or update on public.ai_provider_connections
  for each row execute function private.audit_row();
create trigger audit_ai_connection_assignments after insert or update on public.ai_connection_assignments
  for each row execute function private.audit_row();

-- Vault access: ONLY service_role (the Edge Function). Never exposed to employees or admins' browsers.
create or replace function public.ai_connection_set_key(p_company uuid, p_connection uuid, p_key text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_secret uuid;
begin
  if p_key is null or length(p_key) < 20 or length(p_key) > 400 then
    raise exception 'PPI_INPUT: the key does not look valid' using errcode = 'P0001';
  end if;
  select vault_secret_id into v_secret from public.ai_provider_connections where company_id = p_company and id = p_connection;
  if not found then raise exception 'PPI_INPUT: connection not found' using errcode = 'P0001'; end if;
  if v_secret is null then
    v_secret := vault.create_secret(p_key, 'ppi_ai_' || p_connection::text, 'PPI AI provider key');
  else
    perform vault.update_secret(v_secret, p_key);
  end if;
  update public.ai_provider_connections
     set vault_secret_id = v_secret, key_set_at = now(), health = 'configured', cooldown_until = null, last_error_class = null
   where company_id = p_company and id = p_connection;
end $$;
create or replace function public.ai_connection_get_key(p_company uuid, p_connection uuid)
returns text language sql stable security definer set search_path = '' as $$
  select s.decrypted_secret from public.ai_provider_connections c
    join vault.decrypted_secrets s on s.id = c.vault_secret_id
   where c.company_id = p_company and c.id = p_connection and c.status = 'active'
$$;
revoke all on function public.ai_connection_set_key(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.ai_connection_get_key(uuid, uuid) from public, anon, authenticated;
grant execute on function public.ai_connection_set_key(uuid, uuid, text) to service_role;
grant execute on function public.ai_connection_get_key(uuid, uuid) to service_role;
revoke all on function private.ai_connection_limit_guard() from public, anon, authenticated;
