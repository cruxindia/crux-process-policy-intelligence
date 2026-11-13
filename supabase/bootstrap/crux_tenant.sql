-- One-time bootstrap of the real CRUX tenant (applied 2026-11-11 on Shantanu's instruction).
-- Creates: company, candidate roles + permissions (AQ-005: not yet confirmed by CRUX), the starter question set,
-- and the first administrator. No departments, processes or people are invented; the administrator adds them in the app.
-- The first administrator signs in by email link (Supabase team address) and can then set a password in the app.
-- Usage: psql -v admin_email=name@company -f crux_tenant.sql   (or set ppi.admin_email before running the DO block)
select set_config('ppi.admin_email', :'admin_email', false);
do $$
declare v_co uuid; v_user uuid; v_mid uuid; v_email text := current_setting('ppi.admin_email');
begin
  insert into public.companies (code, name) values ('CRUX', 'CRUX Risk Management Pvt. Ltd.') returning id into v_co;

  insert into public.roles (company_id, code, name, description)
  select v_co, r.code, r.name, r.descr from (values
    ('COMPANY_ADMIN','Company administrator','Organisation set-up, members, roles, audit (technical administration)'),
    ('DISCOVERY_LEAD','Discovery lead','Runs interview campaigns company-wide and reviews interviews'),
    ('DEPT_HEAD','Department head','Leads discovery and knowledge for their department'),
    ('EMPLOYEE','Participant / employee','Answers interviews, uploads evidence, raises clarifications'),
    ('BE_REVIEWER','Business Excellence reviewer','Verifies knowledge and reviews documents functionally'),
    ('PROCESS_OWNER','Process owner','Owns a process model and reviews its documents'),
    ('DOC_APPROVER','Document approver','Approves and publishes controlled documents; decides disputes')) r(code, name, descr);
  insert into public.role_permissions (company_id, role_id, permission_code)
  select v_co, ro.id, p from public.roles ro join (values
    ('COMPANY_ADMIN', array['org.manage','membership.manage','role.manage','audit.read','dashboard.read','process.read','process.edit']),
    ('DISCOVERY_LEAD', array['interview.manage','interview.review','process.read','knowledge.read','evidence.read','dashboard.read']),
    ('DEPT_HEAD', array['process.read','process.edit','interview.manage','interview.review','evidence.read','evidence.upload','evidence.review',
                        'knowledge.read','knowledge.edit','knowledge.verify','clarification.create','clarification.respond','clarification.manage',
                        'dispute.raise','document.read','document.draft','classified.confidential_read','dashboard.read','process.validate']),
    ('EMPLOYEE', array['process.read','knowledge.read','evidence.upload','clarification.create','clarification.respond','dispute.raise','document.read']),
    ('BE_REVIEWER', array['process.read','knowledge.read','knowledge.verify','evidence.read','interview.review','document.read',
                          'document.review_functional','dispute.raise','clarification.create','dashboard.read']),
    ('PROCESS_OWNER', array['process.read','process.edit','process.approve','knowledge.read','knowledge.edit','knowledge.verify',
                            'document.read','document.review_owner','dispute.raise','process.validate']),
    ('DOC_APPROVER', array['process.read','knowledge.read','knowledge.approve','document.read','document.approve','document.publish',
                           'dispute.decide','dashboard.read','classified.confidential_read'])) v(code, perms) on v.code = ro.code
  cross join lateral unnest(v.perms) p
  where ro.company_id = v_co;

  perform public.load_starter_templates(v_co);

  select id into v_user from auth.users where lower(email) = lower(v_email);
  if v_user is null then
    v_user := gen_random_uuid();
    insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
                            created_at, updated_at, confirmation_token, recovery_token, email_change_token_new, email_change)
    values (v_user, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', lower(v_email), '', now(),
            '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '');
    insert into auth.identities (id, user_id, provider_id, identity_data, provider, created_at, updated_at)
    values (gen_random_uuid(), v_user, v_user::text, jsonb_build_object('sub', v_user::text, 'email', lower(v_email), 'email_verified', true), 'email', now(), now());
  end if;
  insert into public.user_profiles (id, display_name) values (v_user, 'Shantanu') on conflict (id) do nothing;
  insert into public.memberships (company_id, user_id, job_title, status)
  values (v_co, v_user, 'AVP — Operations & Growth, Business Excellence & Culture', 'active') returning id into v_mid;
  insert into public.role_assignments (company_id, membership_id, role_id, scope_type)
  select v_co, v_mid, id, 'company' from public.roles where company_id = v_co and code in ('COMPANY_ADMIN','DISCOVERY_LEAD');
end $$;
