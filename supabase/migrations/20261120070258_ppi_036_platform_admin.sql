-- PPI-036: platform owner ("super admin") and company provisioning (D-091, D-092).
-- The super admin is a platform role, not a company membership. He sees every company's metadata and figures
-- (counts, usage, billing, health) but never interview content or documents unless he is a member of that company.

create table private.platform_admins (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  note       text,
  added_at   timestamptz not null default now()
);
alter table private.platform_admins enable row level security;   -- no policies: reachable only through the functions below

create or replace function private.is_platform_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from private.platform_admins where user_id = (select auth.uid()))
$$;
revoke all on function private.is_platform_admin() from public, anon;
grant execute on function private.is_platform_admin() to authenticated;

create or replace function public.am_platform_admin() returns boolean
language sql stable security definer set search_path = '' as $$ select private.is_platform_admin() $$;
revoke all on function public.am_platform_admin() from public, anon;
grant execute on function public.am_platform_admin() to authenticated;

alter table public.companies drop constraint companies_status_check;
alter table public.companies add constraint companies_status_check check (status in ('trial', 'active', 'suspended', 'archived'));
alter table public.companies
  add column is_demo boolean not null default false,
  add column status_note text;

-- Platform settings (key/value), e.g. which company is the template for new companies.
create table private.platform_settings (key text primary key, value text not null, updated_at timestamptz not null default now());
alter table private.platform_settings enable row level security;
insert into private.platform_settings (key, value) values ('template_company', 'CRUX');

-- Platform audit trail (who did what across companies). Append-only; only the platform owner reads it.
create table private.platform_events (
  id         bigint generated always as identity primary key,
  actor      uuid not null,
  company_id uuid references public.companies(id),
  action     text not null,
  detail     jsonb not null default '{}',
  at         timestamptz not null default now()
);
alter table private.platform_events enable row level security;
create trigger platform_events_append_only before update or delete on private.platform_events for each row execute function private.forbid_mutation();

-- A new company gets the standard set-up of the template company: roles and permissions, interview templates,
-- AI prompt registrations, the expert board and the functional catalogue. No people, departments or processes are invented.
create or replace function private.provision_company(p_code text, p_name text, p_template text default 'CRUX', p_demo boolean default false)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_co uuid := gen_random_uuid(); v_tpl uuid;
begin
  select id into v_tpl from public.companies where code = p_template;
  if v_tpl is null then raise exception 'PPI_CONFIG: template company % not found', p_template using errcode = 'P0001'; end if;
  insert into public.companies (id, code, name, is_demo, status) values (v_co, upper(trim(p_code)), trim(p_name), p_demo, case when p_demo then 'active' else 'trial' end);
  insert into public.roles (company_id, code, name, description)
    select v_co, code, name, description from public.roles
     where company_id = v_tpl and code in ('COMPANY_ADMIN','DISCOVERY_LEAD','DEPT_HEAD','EMPLOYEE','BE_REVIEWER','PROCESS_OWNER','DOC_APPROVER');
  insert into public.role_permissions (company_id, role_id, permission_code)
    select v_co, nr.id, rp.permission_code
      from public.role_permissions rp join public.roles r on r.id = rp.role_id
      join public.roles nr on nr.company_id = v_co and nr.code = r.code
     where rp.company_id = v_tpl;
  insert into public.prompt_versions (company_id, prompt_key, version, purpose, template_sha256, output_schema, status)
    select v_co, prompt_key, version, purpose, template_sha256, output_schema, status from public.prompt_versions where company_id = v_tpl and status = 'active';
  insert into public.agent_teams (company_id, code, name, mission, sort_order)
    select v_co, code, name, mission, sort_order from public.agent_teams where company_id = v_tpl;
  insert into public.agent_roles (company_id, team_id, code, version, title, credentials, charter, charter_sha256)
    select v_co, nt.id, ar.code, ar.version, ar.title, ar.credentials, ar.charter, ar.charter_sha256
      from public.agent_roles ar join public.agent_teams t on t.id = ar.team_id
      join public.agent_teams nt on nt.company_id = v_co and nt.code = t.code
     where ar.company_id = v_tpl and ar.status = 'active';
  -- AI data policies: copied, but consent to a training provider is the client's own decision, so it is NOT copied:
  -- providers that may train on inputs start limited to public data until this company's owner accepts.
  insert into public.ai_provider_policies (company_id, provider, max_classification, may_train_on_inputs, terms_checked_on, status, notes)
    select v_co, provider, case when may_train_on_inputs then 'public' else max_classification end, may_train_on_inputs, terms_checked_on, status,
           case when may_train_on_inputs then 'Training provider: limited to public data until this company accepts (copied at set-up).' else notes end
      from public.ai_provider_policies where company_id = v_tpl;
  perform public.load_starter_templates(v_co);
  perform private.seed_blueprint_catalogue(v_co);
  return v_co;
end $$;
revoke all on function private.provision_company(text, text, text, boolean) from public, anon, authenticated;

-- Create a company and its first administrator (an existing account is reused; a new one gets a temporary password,
-- returned once and never stored in clear).
create or replace function public.platform_create_company(p_code text, p_name text, p_admin_email text, p_admin_name text, p_admin_job text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_co uuid; v_email text := lower(trim(coalesce(p_admin_email, ''))); v_user uuid; v_pw text; v_mid uuid;
begin
  if not private.is_platform_admin() then raise exception 'PPI_FORBIDDEN: platform owner only' using errcode = '42501'; end if;
  if upper(trim(coalesce(p_code, ''))) !~ '^[A-Z0-9][A-Z0-9_-]{1,31}$' then
    raise exception 'PPI_INPUT: the short code uses 2-32 letters, digits, - or _ (e.g. ACME)' using errcode = 'P0001'; end if;
  if length(trim(coalesce(p_name, ''))) < 2 then raise exception 'PPI_INPUT: enter the company name' using errcode = 'P0001'; end if;
  if exists (select 1 from public.companies where code = upper(trim(p_code))) then
    raise exception 'PPI_INPUT: that short code is already used' using errcode = 'P0001'; end if;
  if v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then raise exception 'PPI_INPUT: enter the administrator''s email' using errcode = 'P0001'; end if;
  if length(trim(coalesce(p_admin_name, ''))) = 0 then raise exception 'PPI_INPUT: enter the administrator''s name' using errcode = 'P0001'; end if;
  v_co := private.provision_company(p_code, p_name, coalesce((select value from private.platform_settings where key = 'template_company'), 'CRUX'));
  select id into v_user from auth.users where lower(email) = v_email;
  if v_user is null then
    v_user := gen_random_uuid(); v_pw := private.gen_temp_password();
    insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
                            created_at, updated_at, confirmation_token, recovery_token, email_change_token_new, email_change)
    values (v_user, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', v_email, extensions.crypt(v_pw, extensions.gen_salt('bf', 10)),
            now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '');
    insert into auth.identities (id, user_id, provider_id, identity_data, provider, created_at, updated_at)
    values (gen_random_uuid(), v_user, v_user::text, jsonb_build_object('sub', v_user::text, 'email', v_email, 'email_verified', true), 'email', now(), now());
    insert into private.pending_credentials (user_id, company_id, temp_hash, issued_by_membership_id, expires_at)
      select v_user, v_co, u.encrypted_password, null, now() + interval '7 days' from auth.users u where u.id = v_user;
  end if;
  insert into public.user_profiles (id, display_name) values (v_user, trim(p_admin_name)) on conflict (id) do nothing;
  insert into public.memberships (company_id, user_id, job_title, status) values (v_co, v_user, nullif(trim(coalesce(p_admin_job, '')), ''), 'invited') returning id into v_mid;
  insert into public.role_assignments (company_id, membership_id, role_id, scope_type)
    select v_co, v_mid, id, 'company' from public.roles where company_id = v_co and code in ('COMPANY_ADMIN', 'DISCOVERY_LEAD');
  insert into private.platform_events (actor, company_id, action, detail)
  values (auth.uid(), v_co, 'company.created', jsonb_build_object('code', upper(trim(p_code)), 'admin_membership', v_mid));
  return jsonb_build_object('company_id', v_co, 'membership_id', v_mid, 'temporary_password', v_pw, 'existing_account', v_pw is null);
end $$;
revoke all on function public.platform_create_company(text, text, text, text, text) from public, anon;
grant execute on function public.platform_create_company(text, text, text, text, text) to authenticated;

create or replace function public.platform_set_company_status(p_company uuid, p_status text, p_note text default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_platform_admin() then raise exception 'PPI_FORBIDDEN: platform owner only' using errcode = '42501'; end if;
  if p_status not in ('trial', 'active', 'suspended', 'archived') then raise exception 'PPI_INPUT: unknown status' using errcode = 'P0001'; end if;
  if p_status in ('suspended', 'archived') and length(trim(coalesce(p_note, ''))) < 5 then
    raise exception 'PPI_INPUT: give a reason' using errcode = 'P0001'; end if;
  update public.companies set status = p_status, status_note = nullif(trim(coalesce(p_note, '')), '') where id = p_company;
  if not found then raise exception 'PPI_INPUT: company not found' using errcode = 'P0001'; end if;
  insert into private.platform_events (actor, company_id, action, detail) values (auth.uid(), p_company, 'company.status', jsonb_build_object('status', p_status, 'note', p_note));
end $$;
revoke all on function public.platform_set_company_status(uuid, text, text) from public, anon;
grant execute on function public.platform_set_company_status(uuid, text, text) to authenticated;

-- Per-company figures for the platform console: counts only, no content.
create or replace function public.platform_companies()
returns table (company_id uuid, code text, name text, status text, is_demo boolean, created_at timestamptz,
  members_active int, members_invited int, departments int, interviews_started int, interviews_submitted int,
  processes_found int, company_processes int, validated int, documents_approved int, ai_runs_30d int, last_activity timestamptz)
language sql stable security definer set search_path = '' as $$
  select c.id, c.code, c.name, c.status, c.is_demo, c.created_at,
    (select count(*) from public.memberships m where m.company_id = c.id and m.status = 'active' and m.member_kind = 'human')::int,
    (select count(*) from public.memberships m where m.company_id = c.id and m.status = 'invited')::int,
    (select count(*) from public.departments d where d.company_id = c.id)::int,
    (select count(*) from public.interview_sessions s where s.company_id = c.id)::int,
    (select count(*) from public.interview_sessions s where s.company_id = c.id and s.submitted_at is not null)::int,
    (select count(*) from public.discovered_processes p where p.company_id = c.id and p.status <> 'removed')::int,
    (select count(distinct item_id) from public.catalogue_item_sources x where x.company_id = c.id)::int,
    (select count(distinct item_id) from public.process_validations v where v.company_id = c.id and v.decision = 'validated')::int,
    (select count(*) from public.board_cases b where b.company_id = c.id and b.status = 'approved')::int,
    (select count(*) from public.ai_runs r where r.company_id = c.id and r.created_at > now() - interval '30 days')::int,
    greatest((select max(a.answered_at) from public.interview_answers a where a.company_id = c.id),
             (select max(r.created_at) from public.ai_runs r where r.company_id = c.id))
  from public.companies c
  where private.is_platform_admin()
  order by c.created_at
$$;
revoke all on function public.platform_companies() from public, anon;
grant execute on function public.platform_companies() to authenticated;
