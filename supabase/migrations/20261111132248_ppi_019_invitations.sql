-- PPI-019 Invitations that do not depend on email delivery.
-- An admin (membership.manage; role.manage to attach a role) invites a person. If the person has no account yet,
-- one is created with a one-time temporary password that is returned ONCE to the admin and never stored in plain text.
-- The person must replace it with their own password before they can accept the invitation; until then they hold no
-- active membership and therefore no permissions (enforced here, not only in the app).
-- Note: writes to auth.users/auth.identities mirror Supabase Auth's own schema (risk PR-026; re-test after Auth upgrades).

create table private.pending_credentials (
  user_id                 uuid primary key references auth.users(id) on delete cascade,
  company_id              uuid not null references public.companies(id),
  temp_hash               text not null,              -- bcrypt hash as stored in auth.users at issue time
  issued_by_membership_id uuid,
  expires_at              timestamptz not null,
  created_at              timestamptz not null default now()
);
alter table private.pending_credentials enable row level security;     -- no policies: reachable only via the functions below
revoke all on private.pending_credentials from public, anon, authenticated;

create or replace function private.gen_temp_password() returns text
language sql volatile set search_path = '' as $$
  -- 18 random bytes -> 24 base64 chars (~144 bits); ambiguous symbols replaced
  select translate(encode(extensions.gen_random_bytes(18), 'base64'), '+/=', 'xyz')
$$;

create or replace function public.invite_member(
  p_company uuid, p_email text, p_display_name text, p_job_title text default null,
  p_department uuid default null, p_role_code text default null, p_scope_department uuid default null)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_email text := lower(trim(coalesce(p_email, '')));
  v_user uuid; v_pw text; v_mid uuid; v_role uuid;
begin
  if not (private.is_human_actor(p_company) and private.has_permission(p_company, 'membership.manage')) then
    raise exception 'PPI_FORBIDDEN: inviting people requires membership management' using errcode = '42501';
  end if;
  if p_role_code is not null and not private.has_permission(p_company, 'role.manage') then
    raise exception 'PPI_FORBIDDEN: giving a role requires role management' using errcode = '42501';
  end if;
  if v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'PPI_INPUT: enter a valid email address' using errcode = 'P0001';
  end if;
  if length(trim(coalesce(p_display_name, ''))) = 0 then
    raise exception 'PPI_INPUT: enter the person''s name' using errcode = 'P0001';
  end if;
  if p_role_code is not null then
    select id into v_role from public.roles where company_id = p_company and code = p_role_code;
    if v_role is null then raise exception 'PPI_INPUT: unknown role %', p_role_code using errcode = 'P0001'; end if;
  end if;

  select id into v_user from auth.users where lower(email) = v_email;
  if v_user is not null and exists (select 1 from public.memberships where company_id = p_company and user_id = v_user) then
    raise exception 'PPI_INVITE: this person is already a member or already invited' using errcode = 'P0001';
  end if;

  if v_user is null then
    v_user := gen_random_uuid();
    v_pw := private.gen_temp_password();
    insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
                            raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
                            confirmation_token, recovery_token, email_change_token_new, email_change)
    values (v_user, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', v_email,
            extensions.crypt(v_pw, extensions.gen_salt('bf', 10)), now(),
            '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '');
    insert into auth.identities (id, user_id, provider_id, identity_data, provider, created_at, updated_at)
    values (gen_random_uuid(), v_user, v_user::text,
            jsonb_build_object('sub', v_user::text, 'email', v_email, 'email_verified', true), 'email', now(), now());
    insert into private.pending_credentials (user_id, company_id, temp_hash, issued_by_membership_id, expires_at)
    select v_user, p_company, u.encrypted_password, private.my_membership(p_company), now() + interval '7 days'
      from auth.users u where u.id = v_user;
  end if;

  insert into public.user_profiles (id, display_name) values (v_user, trim(p_display_name)) on conflict (id) do nothing;
  insert into public.memberships (company_id, user_id, job_title, primary_department_id, status)
  values (p_company, v_user, nullif(trim(coalesce(p_job_title, '')), ''), p_department, 'invited')
  returning id into v_mid;
  if v_role is not null then
    insert into public.role_assignments (company_id, membership_id, role_id, scope_type, scope_department_id)
    values (p_company, v_mid, v_role, case when p_scope_department is null then 'company' else 'department' end, p_scope_department);
  end if;
  return jsonb_build_object('membership_id', v_mid, 'temporary_password', v_pw, 'existing_account', v_pw is null);
end $$;

-- Re-issue a temporary password: only for an invited person who has never replaced their temporary password
-- (so an admin can never take over an account that a person has already secured).
create or replace function public.reissue_temporary_password(p_company uuid, p_membership uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare v_user uuid; v_pw text;
begin
  if not (private.is_human_actor(p_company) and private.has_permission(p_company, 'membership.manage')) then
    raise exception 'PPI_FORBIDDEN: requires membership management' using errcode = '42501';
  end if;
  select m.user_id into v_user from public.memberships m
    join private.pending_credentials c on c.user_id = m.user_id and c.company_id = m.company_id
    join auth.users u on u.id = m.user_id and u.encrypted_password = c.temp_hash
   where m.company_id = p_company and m.id = p_membership and m.status = 'invited';
  if v_user is null then
    raise exception 'PPI_INVITE: only an invited person who has not yet set their own password can get a new temporary password'
      using errcode = 'P0001';
  end if;
  v_pw := private.gen_temp_password();
  update auth.users set encrypted_password = extensions.crypt(v_pw, extensions.gen_salt('bf', 10)), updated_at = now() where id = v_user;
  update private.pending_credentials c set temp_hash = u.encrypted_password, expires_at = now() + interval '7 days',
         issued_by_membership_id = private.my_membership(p_company)
    from auth.users u where u.id = v_user and c.user_id = v_user;
  return v_pw;
end $$;

-- Does the signed-in person still have to replace a temporary password?
create or replace function public.password_change_required() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from private.pending_credentials c join auth.users u on u.id = c.user_id
                  where c.user_id = (select auth.uid()) and u.encrypted_password = c.temp_hash)
$$;

-- Accepting an invitation now requires the temporary password to have been replaced, and not expired.
create or replace function public.accept_membership(p_company uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_pending record;
begin
  if (select auth.uid()) is null then
    raise exception 'PPI_AUTH: sign in before accepting an invitation' using errcode = '42501';
  end if;
  select c.expires_at, (u.encrypted_password = c.temp_hash) as unchanged into v_pending
    from private.pending_credentials c join auth.users u on u.id = c.user_id where c.user_id = (select auth.uid());
  if v_pending.unchanged then
    if v_pending.expires_at < now() then
      raise exception 'PPI_PASSWORD: your temporary password has expired; ask your administrator for a new one' using errcode = 'P0001';
    end if;
    raise exception 'PPI_PASSWORD: set your own password before accepting the invitation' using errcode = 'P0001';
  end if;
  update public.memberships set status = 'active'
   where company_id = p_company and user_id = (select auth.uid()) and status = 'invited'
     and (valid_to is null or valid_to > now())
  returning id into v_id;
  if v_id is null then
    raise exception 'PPI_INVITE: no pending invitation for this account in this company' using errcode = 'P0001';
  end if;
  delete from private.pending_credentials where user_id = (select auth.uid());
  return v_id;
end $$;

revoke all on function private.gen_temp_password() from public, anon, authenticated;
revoke all on function public.invite_member(uuid, text, text, text, uuid, text, uuid), public.reissue_temporary_password(uuid, uuid),
                       public.password_change_required(), public.accept_membership(uuid) from public, anon;
grant execute on function public.invite_member(uuid, text, text, text, uuid, text, uuid), public.reissue_temporary_password(uuid, uuid),
                          public.password_change_required(), public.accept_membership(uuid) to authenticated;
