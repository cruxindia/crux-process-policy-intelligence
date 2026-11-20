-- PPI-036: platform owner (super admin) and company provisioning.
begin;
select plan(18);

insert into auth.users (id, email) values (tests.uid('platform_owner'), 'platform_owner@example.invalid');
insert into private.platform_admins (user_id, note) values (tests.uid('platform_owner'), 'test');
update private.platform_settings set value = 'ALPHA' where key = 'template_company';
insert into public.ai_provider_policies (company_id, provider, max_classification, may_train_on_inputs, terms_checked_on, status)
values (tests.company('ALPHA'), 'test_paid', 'confidential', false, current_date, 'active'),
       (tests.company('ALPHA'), 'test_free', 'public', true, current_date, 'active')
on conflict (company_id, provider) do nothing;

select tests.login('a_admin'); set local role authenticated;
select is(public.am_platform_admin(), false, 'a company admin is not the platform owner');
select is((select count(*)::int from public.platform_companies()), 0, 'company admins see no platform figures');
select throws_ok($$ select public.platform_create_company('NEWCO', 'New Co', 'x@example.invalid', 'X') $$, '42501', null, 'company admins cannot create companies');
select throws_ok($$ select public.platform_set_company_status(tests.company('BETA'), 'suspended', 'not paid') $$, '42501', null, 'nor change a company''s status');
reset role;

select tests.login('platform_owner'); set local role authenticated;
select is(public.am_platform_admin(), true, 'the platform owner is recognised');
select ok((select count(*) from public.platform_companies()) >= 2, 'the platform owner sees every company');
select ok((select members_active from public.platform_companies() where code = 'ALPHA') > 0, 'with figures (active members)');
select is((select count(*)::int from public.memberships where company_id = tests.company('ALPHA')), 0, 'but no company records through normal access');
select throws_ok($$ select public.platform_create_company('x', 'Bad', 'a@example.invalid', 'A') $$, 'P0001', null, 'short code is validated');
select lives_ok($$ select public.platform_create_company('NEWCO', 'New Company Pvt Ltd', 'newco.admin@example.invalid', 'Nisha Admin', 'Head of Operations') $$,
                'the platform owner creates a company with its first administrator');
select throws_ok($$ select public.platform_create_company('NEWCO', 'Again', 'b@example.invalid', 'B') $$, 'P0001', null, 'a short code is used once');
select is((public.platform_create_company('NEWCO2', 'Second', 'a_ops_emp@example.invalid', 'Existing Person') ->> 'existing_account')::boolean, true,
          'an existing account is reused (no new password)');
select throws_ok($$ select public.platform_set_company_status((select company_id from public.platform_companies() where code = 'NEWCO'), 'suspended') $$, 'P0001', null, 'suspending needs a reason');
select lives_ok($$ select public.platform_set_company_status((select company_id from public.platform_companies() where code = 'NEWCO'), 'active', null) $$, 'status can be changed');
select throws_ok($$ select count(*) from private.platform_events $$, '42501', null, 'the platform log is not readable through the API');
reset role;

select is((select count(*)::int from public.roles where company_id = tests.company('NEWCO')),
          (select count(*)::int from public.roles where company_id = tests.company('ALPHA')
             and code in ('COMPANY_ADMIN','DISCOVERY_LEAD','DEPT_HEAD','EMPLOYEE','BE_REVIEWER','PROCESS_OWNER','DOC_APPROVER')) + 1,
          'standard roles copied from the template, plus STAKEHOLDER (PPI-044)');
select ok(exists (select 1 from public.memberships m join public.role_assignments ra on ra.membership_id = m.id join public.roles r on r.id = ra.role_id
                  join auth.users u on u.id = m.user_id
                   where m.company_id = tests.company('NEWCO') and u.email = 'newco.admin@example.invalid' and r.code = 'COMPANY_ADMIN' and m.status = 'invited'),
          'the first administrator is invited with the administrator role');
select is((select string_agg(provider || ':' || max_classification, ',' order by provider) from public.ai_provider_policies where company_id = tests.company('NEWCO')
            and provider like 'test_%'), 'test_free:public,test_paid:confidential', 'AI policies copied; training providers start at public data only');

select * from finish();
rollback;
