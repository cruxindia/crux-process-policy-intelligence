-- PPI-020 self-registration via join link with mobile number as user ID.
begin;
select plan(17);

-- Fixture (as owner): campaign with three sections + templates + join link with a known token.
insert into public.question_templates (company_id, code, scope_type, field_key, question_text, status) values
  (tests.company('ALPHA'), 'S-01', 'general', 'self.title', 'Your designation?', 'active'),
  (tests.company('ALPHA'), 'C-01', 'company_dna', 'company.purpose', 'What does the company do?', 'active'),
  (tests.company('ALPHA'), 'R-01', 'process', 'process.name', 'Main process?', 'active'),
  (tests.company('ALPHA'), 'R-02', 'process', 'process.trigger', 'What starts it?', 'active');
insert into public.interview_campaigns (id, company_id, code, name, department_id, owner_membership_id, status, question_scopes)
values ('99999999-0000-4000-8000-000000000201', tests.company('ALPHA'), 'JOIN-01', 'Join test', tests.dept('ALPHA','OPS'),
        tests.mid('a_ops_head'), 'active', array['general','company_dna','process']);
insert into public.company_join_links (company_id, label, token_sha256, campaign_id, department_id, max_per_day)
values (tests.company('ALPHA'), 'test', encode(extensions.digest('good-token', 'sha256'), 'hex'),
        '99999999-0000-4000-8000-000000000201', tests.dept('ALPHA','OPS'), 3);

select is(public.normalise_mobile('+91 98765-43210'), '9876543210', 'mobile normalised from +91 format');
select is(public.normalise_mobile('12345'), null, 'invalid mobile rejected');
select is(public.mobile_login_id('09876543210'), '919876543210@mobile.crux-ppi.invalid', 'login ID derived consistently');

set local role anon;
select is(public.join_link_info('good-token') ->> 'campaign', 'Join test', 'anyone with the link sees company/campaign name');
select is(public.join_link_info('bad-token'), null, 'a wrong token reveals nothing');
select throws_ok($$ select public.register_with_join_link('bad-token', '9876543210', 'Asha Rao', 'secret-pass') $$, 'P0001', null,
                 'registration with an invalid link is refused');
select throws_ok($$ select public.register_with_join_link('good-token', '9876543210', 'Asha Rao', 'short') $$, 'P0001', null,
                 'password shorter than 8 characters is refused');
select ok(public.register_with_join_link('good-token', '9876543210', 'Asha Rao', 'secret-pass') ->> 'login' = '919876543210@mobile.crux-ppi.invalid',
          'a person registers with mobile + password via the link');
select throws_ok($$ select public.register_with_join_link('good-token', '+91 98765 43210', 'Asha Again', 'secret-pass') $$, 'P0001', null,
                 'the same mobile cannot register twice');
select throws_ok($$ select * from public.company_join_links $$, '42501', null, 'anonymous visitors cannot read join links');
reset role;

select ok((select encrypted_password = extensions.crypt('secret-pass', encrypted_password) from auth.users
            where email = '919876543210@mobile.crux-ppi.invalid'), 'password stored only as bcrypt hash');

-- The new person: active member, no permissions, own interview only, sections in order.
select set_config('request.jwt.claims', json_build_object('sub', (select id from auth.users where email = '919876543210@mobile.crux-ppi.invalid'),
                  'role', 'authenticated', 'actor_type', 'user')::text, true);
set local role authenticated;
select is((select status from public.memberships where user_id = auth.uid()), 'active', 'membership is active straight away');
select is((select count(*)::int from public.my_permissions(tests.company('ALPHA'))), 0, 'self-registered person holds no permissions');
select is((select count(*)::int from public.processes) + (select count(*)::int from public.knowledge_records), 0,
          'cannot read company processes or knowledge');
select is(public.my_contact() ->> 'mobile', '9876543210', 'person can read own contact details');
select public.start_interview_session((select id from public.interview_assignments where respondent_membership_id =
       (select id from public.memberships where user_id = auth.uid())));
select is((select string_agg(q.field_key, ',' order by q.seq) from public.interview_questions q
            join public.interview_sessions s on s.id = q.session_id join public.interview_assignments a on a.id = s.assignment_id
           where a.respondent_membership_id = (select id from public.memberships where user_id = auth.uid())),
          'self.title,company.purpose,process.name,process.trigger', 'interview asks Self → Company → Process in order');
reset role;

-- Daily cap per link
set local role anon;
select public.register_with_join_link('good-token', '9876500001', 'Second Person', 'secret-pass');
select public.register_with_join_link('good-token', '9876500002', 'Third Person', 'secret-pass');
select throws_ok($$ select public.register_with_join_link('good-token', '9876500003', 'Fourth Person', 'secret-pass') $$, 'P0001', null,
                 'daily sign-up cap per link is enforced');
reset role;

select * from finish();
rollback;
