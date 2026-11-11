-- PPI-021 Admin password reset, member contacts for admins, collaboration visibility + notifications.

-- 1) Admin password reset (no email/SMS exists for mobile accounts). Issues a one-time temporary password;
--    the person must replace it at next sign-in (password_change_required() becomes true).
--    Guard rails: human admin with membership.manage; never yourself; never another administrator.
create or replace function public.admin_reset_password(p_company uuid, p_membership uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare v_user uuid; v_pw text; v_me uuid := private.my_membership(p_company);
begin
  if not (private.is_human_actor(p_company) and private.has_permission(p_company, 'membership.manage')) then
    raise exception 'PPI_FORBIDDEN: resetting passwords requires membership management' using errcode = '42501';
  end if;
  select m.user_id into v_user from public.memberships m
   where m.company_id = p_company and m.id = p_membership and m.status in ('active','invited') and m.member_kind = 'human';
  if v_user is null then raise exception 'PPI_INPUT: member not found' using errcode = 'P0001'; end if;
  if p_membership = v_me then
    raise exception 'PPI_SOD: use the Password page to change your own password' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.role_assignments ra join public.role_permissions rp on rp.company_id = ra.company_id and rp.role_id = ra.role_id
              where ra.company_id = p_company and ra.membership_id = p_membership and ra.status = 'active'
                and rp.permission_code in ('membership.manage','role.manage','org.manage')) then
    raise exception 'PPI_SOD: an administrator''s password cannot be reset by another administrator here' using errcode = 'P0001';
  end if;
  v_pw := private.gen_temp_password();
  update auth.users set encrypted_password = extensions.crypt(v_pw, extensions.gen_salt('bf', 10)), updated_at = now() where id = v_user;
  insert into private.pending_credentials (user_id, company_id, temp_hash, issued_by_membership_id, expires_at)
  select v_user, p_company, u.encrypted_password, v_me, now() + interval '7 days' from auth.users u where u.id = v_user
  on conflict (user_id) do update set temp_hash = excluded.temp_hash, issued_by_membership_id = excluded.issued_by_membership_id,
                                      expires_at = excluded.expires_at, company_id = excluded.company_id;
  insert into public.audit_events (company_id, actor_user_id, actor_type, action, object_type, object_id, changed_fields)
  values (p_company, (select auth.uid()), 'user', 'PASSWORD_RESET', 'memberships', p_membership::text, array['password']);
  return v_pw;
end $$;

-- After a reset the person replaces the password; drop the pending marker once it no longer matches (called by the app).
create or replace function public.clear_password_marker() returns void
language sql security definer set search_path = '' as $$
  delete from private.pending_credentials c using auth.users u, public.memberships m
   where c.user_id = (select auth.uid()) and u.id = c.user_id and u.encrypted_password <> c.temp_hash
     and m.user_id = c.user_id and m.status = 'active'
$$;

-- 2) Contact details of members, for administrators only (to hand over temporary passwords).
create or replace function public.member_contacts(p_company uuid)
returns table (membership_id uuid, mobile text, email text)
language sql stable security definer set search_path = '' as $$
  select m.id, c.mobile, coalesce(c.email, case when u.email not like '%@mobile.crux-ppi.invalid' then u.email end)
    from public.memberships m
    join auth.users u on u.id = m.user_id
    left join private.contact_details c on c.user_id = m.user_id
   where m.company_id = p_company and private.has_permission(p_company, 'membership.manage')
$$;

-- 3) Parties of a clarification can read (and take part in) the dispute it escalated into.
create or replace function private.can_read_dispute(p_company uuid, p_dispute uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.disputes d where d.company_id = p_company and d.id = p_dispute
     and (private.my_membership(p_company) in (d.raised_by_membership_id, d.decision_owner_membership_id)
          or exists (select 1 from public.dispute_positions p where p.company_id = p_company and p.dispute_id = d.id
                       and p.participant_membership_id = private.my_membership(p_company))
          or exists (select 1 from public.clarification_tasks t where t.company_id = p_company and t.id = d.clarification_task_id
                       and private.my_membership(p_company) in (t.requester_membership_id, t.assignee_membership_id))
          or private.has_permission(p_company, 'dispute.raise', d.department_id, d.process_id)
          or private.has_permission(p_company, 'dispute.decide', d.department_id, d.process_id)))
$$;

-- 4) Notifications: response → requester; dispute raised / new position → decision owner; decision → raiser.
create or replace function private.notify_collab() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_to uuid; v_title text; v_type text; v_obj uuid; v_key text;
begin
  if tg_table_name = 'clarification_responses' then
    select t.requester_membership_id, 'New reply on ' || t.code, 'clarification_task', t.id into v_to, v_title, v_type, v_obj
      from public.clarification_tasks t where t.company_id = new.company_id and t.id = new.task_id;
    if v_to = new.responder_membership_id then return null; end if;
    v_key := 'clarification_response:' || new.id;
  elsif tg_table_name = 'disputes' then
    v_to := new.decision_owner_membership_id; v_title := 'Dispute ' || new.code || ' needs your decision';
    v_type := 'dispute'; v_obj := new.id; v_key := 'dispute_raised:' || new.id;
  elsif tg_table_name = 'dispute_positions' then
    select d.decision_owner_membership_id, 'New position on ' || d.code, 'dispute', d.id into v_to, v_title, v_type, v_obj
      from public.disputes d where d.company_id = new.company_id and d.id = new.dispute_id;
    if v_to = new.participant_membership_id then return null; end if;
    v_key := 'dispute_position:' || new.id;
  elsif tg_table_name = 'dispute_decisions' then
    select d.raised_by_membership_id, 'Dispute ' || d.code || ' decided', 'dispute', d.id into v_to, v_title, v_type, v_obj
      from public.disputes d where d.company_id = new.company_id and d.id = new.dispute_id;
    v_key := 'dispute_decided:' || new.id;
  end if;
  if v_to is not null then
    insert into public.notifications (company_id, recipient_membership_id, kind, title, object_type, object_id, dedupe_key)
    values (new.company_id, v_to, tg_table_name, v_title, v_type, v_obj, v_key) on conflict do nothing;
  end if;
  return null;
end $$;
create trigger clarification_responses_notify after insert on public.clarification_responses for each row execute function private.notify_collab();
create trigger disputes_notify after insert on public.disputes for each row execute function private.notify_collab();
create trigger dispute_positions_notify after insert on public.dispute_positions for each row execute function private.notify_collab();
create trigger dispute_decisions_notify after insert on public.dispute_decisions for each row execute function private.notify_collab();

revoke all on function public.admin_reset_password(uuid, uuid), public.clear_password_marker(), public.member_contacts(uuid) from public, anon;
grant execute on function public.admin_reset_password(uuid, uuid), public.clear_password_marker(), public.member_contacts(uuid) to authenticated;
revoke all on function private.notify_collab() from public, anon, authenticated;
