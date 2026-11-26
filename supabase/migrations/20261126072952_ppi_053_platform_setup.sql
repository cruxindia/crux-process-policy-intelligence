-- PPI-053: the platform owner sets up a client company himself (owner request 26-Nov-2026).
-- 1 Create a company with the platform owner as its first administrator (no separate admin needed), or open an existing
--   company as its administrator. Both are recorded in the platform log and in the company's member list (visible to the
--   company's own administrators), so access is never silent.
-- 2 Company details (legal and operating facts) kept on the company, editable by its administrators.

alter table public.companies add column if not exists profile jsonb not null default '{}'::jsonb;


-- The self-grant guard (PPI-003) stays; the only exception is the platform owner opening a company through
-- platform_open_company, which sets a transaction-local flag and is logged in the platform log.
create or replace function private.role_assignment_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := private.my_membership(new.company_id);
begin
  if (select auth.uid()) is not null then
    if v_actor = new.membership_id
       and not (coalesce(current_setting('ppi.platform_open', true), '') = 'on' and private.is_platform_admin()) then
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

/** Platform owner becomes an active administrator (COMPANY_ADMIN + DISCOVERY_LEAD) of the company. Returns the membership. */
create or replace function public.platform_open_company(p_company uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_mid uuid; v_was text;
begin
  if not private.is_platform_admin() then raise exception 'PPI_FORBIDDEN: platform owner only' using errcode = '42501'; end if;
  if not exists (select 1 from public.companies where id = p_company) then raise exception 'PPI_NOT_FOUND: company' using errcode = 'P0002'; end if;
  insert into public.user_profiles (id, display_name)
    select v_uid, coalesce(nullif(split_part(u.email, '@', 1), ''), 'Platform owner') from auth.users u where u.id = v_uid
  on conflict (id) do nothing;
  select id, status into v_mid, v_was from public.memberships where company_id = p_company and user_id = v_uid;
  if v_mid is null then
    insert into public.memberships (company_id, user_id, job_title, status) values (p_company, v_uid, 'Platform owner (set-up)', 'active') returning id into v_mid;
  elsif v_was <> 'active' then
    update public.memberships set status = 'active', valid_to = null where id = v_mid;
  end if;
  perform set_config('ppi.platform_open', 'on', true);
  insert into public.role_assignments (company_id, membership_id, role_id, scope_type)
    select p_company, v_mid, r.id, 'company' from public.roles r
     where r.company_id = p_company and r.code in ('COMPANY_ADMIN', 'DISCOVERY_LEAD')
       and not exists (select 1 from public.role_assignments ra where ra.company_id = p_company and ra.membership_id = v_mid
                         and ra.role_id = r.id and ra.status = 'active' and ra.scope_type = 'company');
  perform set_config('ppi.platform_open', '', true);
  insert into private.platform_events (actor, company_id, action, detail)
  values (v_uid, p_company, 'company.opened_by_platform_owner', jsonb_build_object('membership', v_mid, 'previous_status', v_was));
  return v_mid;
end $$;

/** Create a company and make the platform owner its first administrator. Returns the company id. */
create or replace function public.platform_create_company_self(p_code text, p_name text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_co uuid;
begin
  if not private.is_platform_admin() then raise exception 'PPI_FORBIDDEN: platform owner only' using errcode = '42501'; end if;
  if upper(trim(coalesce(p_code, ''))) !~ '^[A-Z0-9][A-Z0-9_-]{1,31}$' then
    raise exception 'PPI_INPUT: the short code uses 2-32 letters, digits, - or _ (e.g. ACME)' using errcode = 'P0001'; end if;
  if length(trim(coalesce(p_name, ''))) < 2 then raise exception 'PPI_INPUT: enter the company name' using errcode = 'P0001'; end if;
  if exists (select 1 from public.companies where code = upper(trim(p_code))) then
    raise exception 'PPI_INPUT: that short code is already used' using errcode = 'P0001'; end if;
  v_co := private.provision_company(p_code, p_name, coalesce((select value from private.platform_settings where key = 'template_company'), 'CRUX'));
  insert into private.platform_events (actor, company_id, action, detail)
  values (auth.uid(), v_co, 'company.created', jsonb_build_object('code', upper(trim(p_code)), 'set_up_by', 'platform_owner'));
  perform public.platform_open_company(v_co);
  return v_co;
end $$;

/** Company details (administrators). Only known keys are kept; empty values remove the key. */
create or replace function public.company_profile_set(p_company uuid, p_profile jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_keys text[] := array['legal_name','cin','gstin','pan','incorporated_on','registered_address','industry','services','website',
  'headquarters','locations','branches_own','branches_partner','employees','financial_year','regulators','clients','notes'];
  v_new jsonb; k text;
begin
  if not private.has_permission(p_company, 'org.manage') then raise exception 'PPI_FORBIDDEN: company administrators only' using errcode = '42501'; end if;
  if jsonb_typeof(p_profile) <> 'object' then raise exception 'PPI_INPUT: details must be an object' using errcode = 'P0001'; end if;
  select profile into v_new from public.companies where id = p_company;
  foreach k in array v_keys loop
    if p_profile ? k then
      if length(trim(coalesce(p_profile->>k, ''))) = 0 then v_new := v_new - k;
      else v_new := jsonb_set(v_new, array[k], to_jsonb(left(trim(p_profile->>k), 2000))); end if;
    end if;
  end loop;
  update public.companies set profile = v_new, updated_at = now() where id = p_company;
  return v_new;
end $$;

revoke all on function public.platform_open_company(uuid), public.platform_create_company_self(text, text), public.company_profile_set(uuid, jsonb) from public, anon;
grant execute on function public.platform_open_company(uuid), public.platform_create_company_self(text, text), public.company_profile_set(uuid, jsonb) to authenticated;

/** Set-up guide and document counts in one call (administrators). Counted in the database, so it stays right past
 *  the API's 1,000-row page size (owner's folders hold thousands of files). */
create or replace function public.setup_summary(p_company uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v jsonb;
begin
  if not private.has_permission(p_company, 'org.manage') then raise exception 'PPI_FORBIDDEN: company administrators only' using errcode = '42501'; end if;
  select jsonb_build_object(
    'profile_fields', (select count(*) from public.companies c, jsonb_object_keys(c.profile) where c.id = p_company),
    'checklist_adopted', exists (select 1 from public.company_baselines b where b.company_id = p_company),
    'checklist_documents', (select count(*) from public.register_items r where r.company_id = p_company and r.kind = 'document'),
    'checklist_missing', (select count(*) from public.register_items r where r.company_id = p_company and r.kind = 'document' and r.status = 'missing'),
    'files', (select count(*) from public.source_documents s where s.company_id = p_company),
    'governing', (select count(*) from public.source_documents s where s.company_id = p_company and s.category = 'governing'),
    'records', (select count(*) from public.source_documents s where s.company_id = p_company and s.category = 'record'),
    'sensitive', (select count(*) from public.source_documents s where s.company_id = p_company and s.category = 'sensitive'),
    'unreadable', (select count(*) from public.source_documents s where s.company_id = p_company and s.read_status = 'unreadable'),
    'analysed', (select count(*) from public.source_documents s where s.company_id = p_company and s.analysis_status = 'done'),
    'to_analyse', (select count(*) from public.source_documents s where s.company_id = p_company and s.category = 'governing'
                     and s.read_status = 'read' and s.analysis_status in ('queued', 'running', 'waiting_provider')),
    'waiting_provider', (select count(*) from public.source_documents s where s.company_id = p_company and s.analysis_status = 'waiting_provider'),
    'findings_open', (select count(*) from public.doc_findings f where f.company_id = p_company and f.status = 'open'),
    'processes_documented', (select count(*) from public.doc_processes p where p.company_id = p_company),
    'departments_found', (select count(distinct x.code) from (
        select department_code code from public.source_documents where company_id = p_company and department_code is not null
        union select department_code from public.doc_findings where company_id = p_company and department_code is not null) x),
    'departments_without_reviewer', (select count(distinct x.code) from (
        select department_code code from public.source_documents where company_id = p_company and department_code is not null
        union select department_code from public.doc_findings where company_id = p_company and department_code is not null) x
        where not exists (select 1 from public.doc_stakeholders st where st.company_id = p_company and st.department_code = x.code)),
    'reviewers', (select count(distinct membership_id) from public.doc_stakeholders st where st.company_id = p_company),
    'members_active', (select count(*) from public.memberships m where m.company_id = p_company and m.status = 'active' and m.member_kind = 'human'),
    'members_invited', (select count(*) from public.memberships m where m.company_id = p_company and m.status = 'invited'),
    'interviews_started', (select count(*) from public.interview_sessions s where s.company_id = p_company),
    'interviews_submitted', (select count(*) from public.interview_sessions s where s.company_id = p_company and s.submitted_at is not null)
  ) into v;
  return v;
end $$;
revoke all on function public.setup_summary(uuid) from public, anon;
grant execute on function public.setup_summary(uuid) to authenticated;

/** Last set-up step: every department reviewer gets the AI discovery interview for their department. The interview starts
 *  from what the company's documents say and the open points found in them (discovery prompt v5). Creates the company's
 *  discovery campaign when it has none. Returns {campaign_id, assigned, already}. */
create or replace function public.doc_reviewers_interview(p_company uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_camp uuid; v_me uuid := private.my_membership(p_company); v_new int := 0; v_had int := 0; r record; v_dept uuid;
begin
  if not (private.has_permission(p_company, 'org.manage') or private.has_permission(p_company, 'interview.manage')) then
    raise exception 'PPI_FORBIDDEN: company administrators only' using errcode = '42501'; end if;
  perform private.doc_departments_ensure(p_company);
  select id into v_camp from public.interview_campaigns where company_id = p_company and interview_mode = 'discovery' and status = 'active'
   order by created_at limit 1;
  if v_camp is null then
    insert into public.interview_campaigns (company_id, code, name, purpose, owner_membership_id, status, question_scopes, interview_mode, max_ai_questions)
    values (p_company, 'DOC-REVIEW-' || to_char(now(), 'YYMMDD'), 'Let''s understand the work you do',
            'I will guide you through a conversation about how the work in your department really happens. I already have what your company''s documents say; we will confirm it, fill the gaps and talk about the open points. Just explain your work naturally.',
            v_me, 'active', '{}', 'discovery', 60)
    on conflict (company_id, code) do nothing returning id into v_camp;
    if v_camp is null then select id into v_camp from public.interview_campaigns where company_id = p_company and code = 'DOC-REVIEW-' || to_char(now(), 'YYMMDD'); end if;
  end if;
  for r in select st.membership_id, st.department_code from public.doc_stakeholders st where st.company_id = p_company loop
    select id into v_dept from public.departments where company_id = p_company and code = r.department_code;
    continue when v_dept is null;
    insert into public.interview_assignments (company_id, campaign_id, respondent_membership_id, department_id)
    values (p_company, v_camp, r.membership_id, v_dept) on conflict do nothing;
    if found then v_new := v_new + 1; else v_had := v_had + 1; end if;
  end loop;
  return jsonb_build_object('campaign_id', v_camp, 'assigned', v_new, 'already', v_had);
end $$;
revoke all on function public.doc_reviewers_interview(uuid) from public, anon;
grant execute on function public.doc_reviewers_interview(uuid) to authenticated;
