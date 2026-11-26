-- PPI-053: the platform owner creates a company and sets it up himself; company details.
begin;
select plan(17);

insert into auth.users (id, email) values (tests.uid('platform_owner'), 'platform_owner@example.invalid');
insert into private.platform_admins (user_id, note) values (tests.uid('platform_owner'), 'test');
update private.platform_settings set value = 'ALPHA' where key = 'template_company';
create temp table ids as select tests.company('ALPHA') alpha, tests.company('BETA') beta;
grant select on ids to authenticated;

select tests.login('a_admin'); set local role authenticated;
select throws_ok($$ select public.platform_create_company_self('SELFCO', 'Self Co') $$, '42501', null, 'company admins cannot create companies');
select throws_ok($$ select public.platform_open_company((select beta from ids)) $$, '42501', null, 'nor open another company');
select lives_ok($$ select public.company_profile_set((select alpha from ids), '{"legal_name":"Alpha Services Pvt Ltd","cin":"U74999MH2005PTC000001","bogus":"x"}') $$,
                'a company admin saves the company details');
select is((select profile from public.companies where id = (select alpha from ids)), '{"cin": "U74999MH2005PTC000001", "legal_name": "Alpha Services Pvt Ltd"}'::jsonb,
          'only known keys are kept');
select is((public.setup_summary((select alpha from ids))->>'profile_fields')::int, 2, 'the set-up summary counts the company details');
select lives_ok($$ select public.doc_stakeholder_add((select alpha from ids), 'OPS', (select id from public.memberships where company_id = (select alpha from ids) and user_id = tests.uid('a_ops_head'))) $$,
                'a reviewer is named for Operations');
select ok((public.doc_reviewers_interview((select alpha from ids))->>'campaign_id') is not null, 'reviewers are given the AI interview (campaign created when missing)');
select is((public.doc_reviewers_interview((select alpha from ids))->>'assigned')::int, 0, 'running it again assigns nobody twice');
reset role;
select ok(exists (select 1 from public.interview_assignments a join public.departments d on d.id = a.department_id
                   where a.company_id = (select alpha from ids) and d.code = 'OPS'
                     and a.respondent_membership_id = (select id from public.memberships where company_id = (select alpha from ids) and user_id = tests.uid('a_ops_head'))),
          'the Operations reviewer has the interview for Operations');

select tests.login('b_admin'); set local role authenticated;
select throws_ok($$ select public.company_profile_set((select alpha from ids), '{"legal_name":"Hijack"}') $$, '42501', null, 'another company''s admin cannot change them');
select throws_ok($$ select public.setup_summary((select alpha from ids)) $$, '42501', null, 'nor read the set-up summary');
reset role;

select tests.login('platform_owner'); set local role authenticated;
select lives_ok($$ select public.platform_create_company_self('SELFCO', 'Self Set-up Pvt Ltd') $$, 'the platform owner creates a company without naming another administrator');
select ok(private.has_permission((select id from public.companies where code = 'SELFCO'), 'org.manage'), 'and is its administrator straight away');
select is((select count(*)::int from public.memberships where company_id = (select id from public.companies where code = 'SELFCO') and status = 'active'), 1, 'visible as a member of that company');
select lives_ok($$ select public.platform_open_company((select beta from ids)) $$, 'opens an existing company as administrator');
select ok(private.has_permission((select beta from ids), 'org.manage') and (select public.platform_open_company((select beta from ids))) is not null,
          'repeatable without duplicate roles');
reset role;
select is((select count(*)::int from public.role_assignments ra join public.memberships m on m.id = ra.membership_id
            where m.company_id = (select beta from ids) and m.user_id = tests.uid('platform_owner') and ra.status = 'active'),
          (select count(*)::int from public.roles where company_id = (select beta from ids) and code in ('COMPANY_ADMIN', 'DISCOVERY_LEAD')),
          'one assignment per set-up role (administrator, discovery lead where defined), no duplicates');

select * from finish();
rollback;
