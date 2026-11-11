-- PPI-019 invitations with one-time temporary passwords; password change enforced before access.
begin;
select plan(16);
create temp table inv (k text primary key, r jsonb);
grant all on inv to authenticated;

select tests.login('a_ops_emp'); set local role authenticated;
select throws_ok($$ select public.invite_member(tests.company('ALPHA'), 'x@example.invalid', 'X') $$, '42501', null,
                 'a member without membership.manage cannot invite');
reset role;
select tests.login('a_admin', 'ai'); set local role authenticated;
select throws_ok($$ select public.invite_member(tests.company('ALPHA'), 'x@example.invalid', 'X') $$, '42501', null,
                 'an AI/service token cannot invite even with the permission');
reset role;

select tests.login('a_admin'); set local role authenticated;
insert into inv select 'new', public.invite_member(tests.company('ALPHA'), '  New.Person@Example.invalid ', 'New Person', 'Analyst',
                                                    tests.dept('ALPHA','OPS'), 'EMPLOYEE', tests.dept('ALPHA','OPS'));
select ok(length((select r->>'temporary_password' from inv where k = 'new')) >= 20, 'new person gets a one-time temporary password (>=20 chars)');
select throws_ok($$ select public.invite_member(tests.company('ALPHA'), 'new.person@example.invalid', 'Again') $$, 'P0001', null,
                 'the same email cannot be invited twice (case-insensitive)');
insert into inv select 'existing', public.invite_member(tests.company('ALPHA'), 'b_admin@example.invalid', 'B Admin');
select is((select r->>'temporary_password' from inv where k = 'existing'), null, 'an existing account gets no temporary password');
reset role;

select ok((select u.encrypted_password = extensions.crypt((select r->>'temporary_password' from inv where k = 'new'), u.encrypted_password)
             from auth.users u where u.email = 'new.person@example.invalid'), 'stored hash matches the returned password (plain text not stored)');
select is((select r.scope_type || ':' || ro.code from public.role_assignments r join public.roles ro on ro.id = r.role_id
            join public.memberships m on m.id = r.membership_id join auth.users u on u.id = m.user_id
           where u.email = 'new.person@example.invalid'), 'department:EMPLOYEE', 'role attached with department scope');

-- Invitee signs in with the temporary password.
select set_config('request.jwt.claims', json_build_object('sub', (select id from auth.users where email = 'new.person@example.invalid'),
                  'role', 'authenticated', 'actor_type', 'user')::text, true);
set local role authenticated;
select ok(public.password_change_required(), 'invitee must replace the temporary password');
select throws_ok($$ select public.accept_membership(tests.company('ALPHA')) $$, 'P0001', null,
                 'invitation cannot be accepted with the temporary password still in place');
select is((select count(*)::int from public.processes), 0, 'no access before accepting');
select throws_ok($$ select public.reissue_temporary_password(tests.company('ALPHA'), (select id from public.memberships where user_id = auth.uid())) $$,
                 '42501', null, 'invitee cannot reissue passwords');
reset role;

select tests.login('a_admin'); set local role authenticated;
insert into inv select 'reissued', to_jsonb(public.reissue_temporary_password(tests.company('ALPHA'),
  (select m.id from public.memberships m join public.user_profiles p on p.id = m.user_id where p.display_name = 'New Person')));
reset role;
select ok((select u.encrypted_password = extensions.crypt((select r #>> '{}' from inv where k = 'reissued'), u.encrypted_password)
             and u.encrypted_password <> extensions.crypt((select r->>'temporary_password' from inv where k = 'new'), u.encrypted_password)
             from auth.users u where u.email = 'new.person@example.invalid'), 'reissue replaces the old temporary password');

-- Invitee sets their own password (what Supabase Auth does on updateUser).
update auth.users set encrypted_password = extensions.crypt('my-own-long-password', extensions.gen_salt('bf', 4)) where email = 'new.person@example.invalid';
select set_config('request.jwt.claims', json_build_object('sub', (select id from auth.users where email = 'new.person@example.invalid'),
                  'role', 'authenticated', 'actor_type', 'user')::text, true);
set local role authenticated;
select ok(not public.password_change_required(), 'after setting their own password no change is required');
select isnt(public.accept_membership(tests.company('ALPHA')), null, 'invitee accepts after setting their own password');
reset role;
select is((select count(*)::int from private.pending_credentials c join auth.users u on u.id = c.user_id where u.email = 'new.person@example.invalid'), 0,
          'pending credential removed on acceptance');

select tests.login('a_admin'); set local role authenticated;
select throws_ok($$ select public.reissue_temporary_password(tests.company('ALPHA'),
                    (select m.id from public.memberships m where m.user_id = (select id from public.user_profiles where display_name = 'New Person'))) $$,
                 'P0001', null, 'admin cannot reset the password of someone who has secured their account');
reset role;

select * from finish();
rollback;
