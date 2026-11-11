-- PPI-020 Self-registration through a shared join link, with the mobile number as user ID.
-- * A join link (secret token, stored only as SHA-256) belongs to one company, campaign and department.
-- * Anyone holding the link can register: mobile number (10-digit Indian mobile) + name + password (+ optional email).
--   Supabase Auth sign-up stays disabled; accounts are created only here. The login ID is the mobile number, mapped
--   internally to a non-deliverable address 91XXXXXXXXXX@mobile.crux-ppi.invalid (no SMS/email needed).
-- * The new person becomes an ACTIVE member with NO permissions and gets the campaign interview assigned; they can
--   see only their own interview. Nothing else in the company is readable to them.
-- * Campaign question_scopes define which question sections are asked and in what order.

alter table public.interview_campaigns add column question_scopes text[];
alter table public.interview_campaigns add constraint interview_campaigns_scopes_chk
  check (question_scopes is null or question_scopes <@ array['general','company_dna','department','process','policy','voc']::text[]);

create table public.company_join_links (
  id                  uuid not null default gen_random_uuid() primary key,
  company_id          uuid not null references public.companies(id),
  label               text not null,
  token_sha256        text not null unique,
  campaign_id         uuid not null,
  department_id       uuid not null,
  status              text not null default 'active' check (status in ('active','disabled')),
  max_per_day         int  not null default 300 check (max_per_day > 0),
  created_by_membership_id uuid,
  created_at          timestamptz not null default now(),
  unique (company_id, id),
  foreign key (company_id, campaign_id) references public.interview_campaigns(company_id, id),
  foreign key (company_id, department_id) references public.departments(company_id, id),
  foreign key (company_id, created_by_membership_id) references public.memberships(company_id, id)
);
create index company_join_links_campaign_idx on public.company_join_links (company_id, campaign_id);
create index company_join_links_dept_idx on public.company_join_links (company_id, department_id);
create index company_join_links_creator_idx on public.company_join_links (company_id, created_by_membership_id);
alter table public.company_join_links enable row level security;
create policy cjl_read on public.company_join_links for select to authenticated
  using ((select private.has_permission(company_id, 'membership.manage')));
create policy cjl_update on public.company_join_links for update to authenticated
  using ((select private.has_permission(company_id, 'membership.manage')))
  with check ((select private.has_permission(company_id, 'membership.manage')));
revoke all on public.company_join_links from anon;
-- Same grant baseline as PPI-011: no delete/truncate/references/trigger for API roles; inserts only via SQL/owner.
revoke insert, delete, truncate, references, trigger on public.company_join_links from authenticated;

-- Contact details are personal: readable only by the person (via my_contact) and never through table APIs.
create table private.contact_details (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  mobile     text unique,            -- 10 digits, normalised
  email      text,
  created_at timestamptz not null default now()
);
alter table private.contact_details enable row level security;
revoke all on private.contact_details from public, anon, authenticated;

create table private.registration_log (
  id         bigint generated always as identity primary key,
  link_id    uuid not null references public.company_join_links(id),
  user_id    uuid,
  created_at timestamptz not null default now()
);
create index registration_log_link_time_idx on private.registration_log (link_id, created_at);
alter table private.registration_log enable row level security;
revoke all on private.registration_log from public, anon, authenticated;

create or replace function public.normalise_mobile(p text) returns text
language plpgsql immutable set search_path = '' as $$
declare d text := regexp_replace(coalesce(p, ''), '[^0-9]', '', 'g');
begin
  if length(d) = 12 and left(d, 2) = '91' then d := right(d, 10);
  elsif length(d) = 11 and left(d, 1) = '0' then d := right(d, 10); end if;
  if d !~ '^[6-9][0-9]{9}$' then return null; end if;
  return d;
end $$;

-- Who is this join link for? (safe to show before sign-up: company name + campaign name only)
create or replace function public.join_link_info(p_token text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('company', c.name, 'campaign', ic.name, 'purpose', ic.purpose)
    from public.company_join_links l
    join public.companies c on c.id = l.company_id
    join public.interview_campaigns ic on ic.company_id = l.company_id and ic.id = l.campaign_id
   where l.token_sha256 = encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex')
     and l.status = 'active' and ic.status = 'active'
$$;

create or replace function public.register_with_join_link(
  p_token text, p_mobile text, p_full_name text, p_password text, p_email text default null)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_link record; v_mobile text := public.normalise_mobile(p_mobile);
  v_email text := lower(nullif(trim(coalesce(p_email, '')), ''));
  v_login text; v_user uuid; v_mid uuid;
begin
  select l.* into v_link from public.company_join_links l
    join public.interview_campaigns ic on ic.company_id = l.company_id and ic.id = l.campaign_id
   where l.token_sha256 = encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex')
     and l.status = 'active' and ic.status = 'active';
  if v_link.id is null then
    raise exception 'PPI_JOIN: this sign-up link is not valid any more' using errcode = 'P0001';
  end if;
  if v_mobile is null then
    raise exception 'PPI_INPUT: enter a valid 10-digit mobile number' using errcode = 'P0001';
  end if;
  if length(trim(coalesce(p_full_name, ''))) < 2 then
    raise exception 'PPI_INPUT: enter your full name' using errcode = 'P0001';
  end if;
  if length(coalesce(p_password, '')) < 8 then
    raise exception 'PPI_INPUT: the password must have at least 8 characters' using errcode = 'P0001';
  end if;
  if v_email is not null and v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'PPI_INPUT: the email address is not valid (or leave it empty)' using errcode = 'P0001';
  end if;
  if (select count(*) from private.registration_log where link_id = v_link.id and created_at > now() - interval '1 day') >= v_link.max_per_day then
    raise exception 'PPI_JOIN: too many sign-ups today; try again tomorrow' using errcode = 'P0001';
  end if;
  v_login := '91' || v_mobile || '@mobile.crux-ppi.invalid';
  if exists (select 1 from private.contact_details where mobile = v_mobile)
     or exists (select 1 from auth.users where lower(email) = v_login) then
    raise exception 'PPI_JOIN: this mobile number is already registered — please sign in' using errcode = 'P0001';
  end if;

  v_user := gen_random_uuid();
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
                          raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
                          confirmation_token, recovery_token, email_change_token_new, email_change)
  values (v_user, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', v_login,
          extensions.crypt(p_password, extensions.gen_salt('bf', 10)), now(),
          '{"provider":"email","providers":["email"]}', jsonb_build_object('login', 'mobile'), now(), now(), '', '', '', '');
  insert into auth.identities (id, user_id, provider_id, identity_data, provider, created_at, updated_at)
  values (gen_random_uuid(), v_user, v_user::text,
          jsonb_build_object('sub', v_user::text, 'email', v_login, 'email_verified', true), 'email', now(), now());
  insert into private.contact_details (user_id, mobile, email) values (v_user, v_mobile, v_email);
  insert into public.user_profiles (id, display_name) values (v_user, trim(p_full_name));
  insert into public.memberships (company_id, user_id, primary_department_id, status)
  values (v_link.company_id, v_user, v_link.department_id, 'active') returning id into v_mid;
  insert into public.interview_assignments (company_id, campaign_id, respondent_membership_id, department_id)
  values (v_link.company_id, v_link.campaign_id, v_mid, v_link.department_id);
  insert into private.registration_log (link_id, user_id) values (v_link.id, v_user);
  return jsonb_build_object('login', v_login, 'company_id', v_link.company_id);
end $$;

-- Login helper for the sign-in form: mobile number -> internal login ID (no lookup, pure function).
create or replace function public.mobile_login_id(p_mobile text) returns text
language sql immutable set search_path = '' as $$
  select case when public.normalise_mobile(p_mobile) is null then null
              else '91' || public.normalise_mobile(p_mobile) || '@mobile.crux-ppi.invalid' end
$$;

-- The person's own contact details.
create or replace function public.my_contact() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('mobile', mobile, 'email', email) from private.contact_details where user_id = (select auth.uid())
$$;

-- Respondents cannot read campaign rows' scopes through RLS in every case; read them here.
create or replace function private.campaign_scopes(p_company uuid, p_campaign uuid, out question_scopes text[])
language sql stable security definer set search_path = '' as $$
  select question_scopes from public.interview_campaigns where company_id = p_company and id = p_campaign
$$;

-- Start or resume: when the campaign defines question_scopes, ask those sections in that order.
create or replace function public.start_interview_session(p_assignment uuid) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare v_a record; v_session uuid; v_scopes text[];
begin
  select a.* into v_a from public.interview_assignments a
   join public.memberships m on m.company_id = a.company_id and m.id = a.respondent_membership_id
   where a.id = p_assignment and m.user_id = (select auth.uid()) and m.status = 'active';
  if v_a.id is null then
    raise exception 'PPI_INTERVIEW: this assignment is not yours' using errcode = 'P0001';
  end if;
  select s.id into v_session from public.interview_sessions s
   where s.company_id = v_a.company_id and s.assignment_id = v_a.id and s.status in ('in_progress','reopened');
  if v_session is not null then return v_session; end if;      -- resume

  -- No RETURNING: it would apply the SELECT policy, whose helper cannot see the row inside the same statement.
  v_session := gen_random_uuid();
  insert into public.interview_sessions (id, company_id, assignment_id) values (v_session, v_a.company_id, v_a.id);
  select coalesce(c.question_scopes,
                  array[case when v_a.process_id is not null then 'process' else 'department' end])
    into v_scopes
    from private.campaign_scopes(v_a.company_id, v_a.campaign_id) c;
  insert into public.interview_questions (company_id, session_id, seq, template_id, field_key, question_text, rationale, generated_by)
  select v_a.company_id, v_session, row_number() over (order by array_position(v_scopes, t.scope_type), t.code), t.id,
         t.field_key, t.question_text, 'Standard ' || t.scope_type || ' discovery question ' || t.code, 'template'
    from (select distinct on (q.code) q.* from public.question_templates q
           where q.company_id = v_a.company_id and q.scope_type = any (v_scopes) and q.status = 'active'
           order by q.code, q.version desc) t;
  if v_a.status in ('invited','accepted') then
    update public.interview_assignments set status = 'in_progress' where id = v_a.id;
  end if;
  return v_session;
end $$;

revoke all on function public.register_with_join_link(text, text, text, text, text), public.join_link_info(text),
                       public.mobile_login_id(text), public.normalise_mobile(text), public.my_contact() from public;
grant execute on function public.register_with_join_link(text, text, text, text, text), public.join_link_info(text),
                          public.mobile_login_id(text), public.normalise_mobile(text) to anon, authenticated;
grant execute on function public.my_contact() to authenticated;
revoke all on function private.campaign_scopes(uuid, uuid) from public, anon;
grant execute on function private.campaign_scopes(uuid, uuid) to authenticated, service_role;
