-- SYNTHETIC E2E FIXTURE (dev project only). Tenant E2E-SYNTH; users @example.invalid. No real data.
do $$
declare v_lead uuid := 'e2e00000-0000-4000-8000-00000000000a'; v_resp uuid := 'e2e00000-0000-4000-8000-00000000000b';
        v_co uuid := 'e2e00000-0000-4000-8000-0000000000c0'; v_ops uuid; v_lead_m uuid; v_resp_m uuid; v_role uuid; v_emp uuid;
begin
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
                          created_at, updated_at, confirmation_token, recovery_token, email_change_token_new, email_change)
  select u.id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', u.email, ':BCRYPT_HASH_OF_E2E_PASSWORD', now(),
         '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''
    from (values (v_lead, 'e2e.lead@example.invalid'), (v_resp, 'e2e.respondent@example.invalid')) u(id, email);
  insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  select gen_random_uuid(), u.id, u.id::text, jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true), 'email', now(), now(), now()
    from auth.users u where u.id in (v_lead, v_resp);
  insert into public.user_profiles (id, display_name) values (v_lead, 'E2E Discovery Lead (synthetic)'), (v_resp, 'E2E Respondent (synthetic)');
  insert into public.companies (id, code, name) values (v_co, 'E2E-SYNTH', 'E2E Synthetic Co (test fixture)');
  insert into public.departments (company_id, code, name) values (v_co, 'OPS', 'Operations (synthetic)') returning id into v_ops;
  insert into public.memberships (company_id, user_id, job_title, primary_department_id, status)
    values (v_co, v_lead, 'Discovery lead (synthetic)', v_ops, 'active') returning id into v_lead_m;
  insert into public.memberships (company_id, user_id, job_title, primary_department_id, status)
    values (v_co, v_resp, 'Operations executive (synthetic)', v_ops, 'invited') returning id into v_resp_m;
  insert into public.roles (company_id, code, name) values (v_co, 'DISCOVERY_LEAD', 'Discovery lead (synthetic)') returning id into v_role;
  insert into public.role_permissions (company_id, role_id, permission_code)
    select v_co, v_role, p from unnest(array['interview.manage','interview.review','process.read','dashboard.read','knowledge.read']) p;
  insert into public.roles (company_id, code, name) values (v_co, 'EMPLOYEE', 'Participant (synthetic)') returning id into v_emp;
  insert into public.role_permissions (company_id, role_id, permission_code)
    select v_co, v_emp, p from unnest(array['process.read','knowledge.read','evidence.upload','clarification.create','dispute.raise','document.read']) p;
  insert into public.role_assignments (company_id, membership_id, role_id, scope_type) values (v_co, v_lead_m, v_role, 'company');
  insert into public.role_assignments (company_id, membership_id, role_id, scope_type, scope_department_id) values (v_co, v_resp_m, v_emp, 'department', v_ops);
end $$;
select u.email, m.status, c.code from auth.users u join public.memberships m on m.user_id = u.id join public.companies c on c.id = m.company_id;
