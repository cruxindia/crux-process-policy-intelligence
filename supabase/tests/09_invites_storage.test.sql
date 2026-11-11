-- FR-01 invitation acceptance; FR-09 private evidence storage bound to evidence metadata.
begin;
select plan(18);

-- Admin invites a new person (auth user is created by Supabase Auth invite; simulated here).
insert into auth.users (id, email) values (tests.uid('a_new'), 'a_new@example.invalid');
select tests.login('a_admin'); set local role authenticated;
insert into public.memberships (company_id, user_id, job_title, primary_department_id, status)
values (tests.company('ALPHA'), tests.uid('a_new'), 'New joiner', tests.dept('ALPHA','OPS'), 'invited');
select pass('admin with membership.manage records an invitation');
reset role;
insert into public.role_assignments (company_id, membership_id, role_id, scope_type, scope_department_id)
select tests.company('ALPHA'), m.id, r.id, 'department', tests.dept('ALPHA','OPS')
  from public.memberships m, public.roles r
 where m.user_id = tests.uid('a_new') and r.company_id = tests.company('ALPHA') and r.code = 'EMPLOYEE';

select tests.login('a_new'); set local role authenticated;
select is((select status from public.memberships where user_id = tests.uid('a_new')), 'invited', 'invitee can see own pending invitation');
select is((select name from public.companies where id = tests.company('ALPHA')), 'Synthetic Alpha Co (test)', 'invitee can see the inviting company name');
select is((select count(*)::int from public.processes), 0, 'pending invitee has no permissions yet (roles inactive until accepted)');
select is((select count(*)::int from public.memberships where user_id <> tests.uid('a_new')), 0, 'pending invitee cannot see other members');
select throws_ok($$ select public.accept_membership(tests.company('BETA')) $$, 'P0001', null, 'cannot accept a company that did not invite you');
select isnt(public.accept_membership(tests.company('ALPHA')), null, 'invitee accepts the invitation');
select is((select count(*)::int from public.processes), 1, 'after accepting, scoped role applies (OPS process visible)');
select throws_ok($$ select public.accept_membership(tests.company('ALPHA')) $$, 'P0001', null, 'an invitation cannot be accepted twice');
update public.memberships set job_title = 'Director' where user_id = tests.uid('a_new');
select is((select job_title from public.memberships where user_id = tests.uid('a_new')), 'New joiner',
          'members cannot edit their own membership (no self-promotion)');
reset role;

-- Storage: bucket private; upload only to a registered path by its uploader; read follows evidence permissions.
select is((select public from storage.buckets where id = 'evidence-private'), false, 'evidence bucket is private');
select tests.login('a_ops_emp'); set local role authenticated;
insert into public.evidence_files (id, company_id, department_id, title, storage_path, sha256, mime_type, size_bytes, uploaded_by_membership_id)
values ('88888888-0000-4000-8000-000000000001', tests.company('ALPHA'), tests.dept('ALPHA','OPS'), 'Intake checklist',
        'a0000000-0000-4000-8000-000000000001/88888888-0000-4000-8000-000000000001/checklist.pdf', repeat('b', 64),
        'application/pdf', 1234, tests.mid('a_ops_emp'));
insert into storage.objects (bucket_id, name, owner)
values ('evidence-private', 'a0000000-0000-4000-8000-000000000001/88888888-0000-4000-8000-000000000001/checklist.pdf', tests.uid('a_ops_emp'));
select pass('uploader stores the file at the path registered in evidence_files');
select throws_ok($$ insert into storage.objects (bucket_id, name, owner)
                    values ('evidence-private', 'a0000000-0000-4000-8000-000000000001/unregistered/x.pdf', tests.uid('a_ops_emp')) $$,
                 '42501', null, 'upload to an unregistered path is refused');
update storage.objects set name = name || '.bak' where bucket_id = 'evidence-private';
reset role;
select is((select count(*)::int from pg_policies where schemaname = 'storage' and tablename = 'objects'
            and cmd in ('UPDATE','DELETE','ALL') and (coalesce(qual,'') || coalesce(with_check,'')) like '%evidence-private%'), 0,
          'no update/delete policy exists for the evidence bucket (direct deletes are also blocked by Supabase Storage)');
select is((select count(*)::int from storage.objects
            where name = 'a0000000-0000-4000-8000-000000000001/88888888-0000-4000-8000-000000000001/checklist.pdf'), 1,
          'stored evidence cannot be renamed by users');
select tests.login('a_ops_head'); set local role authenticated;
select is((select count(*)::int from storage.objects where bucket_id = 'evidence-private'), 1, 'OPS head (evidence.read in OPS) can read the file');
reset role;
select tests.login('a_fin_head'); set local role authenticated;
select is((select count(*)::int from storage.objects where bucket_id = 'evidence-private'), 0, 'FIN head cannot read OPS evidence files');
reset role;
select tests.login('b_ops_head'); set local role authenticated;
select is((select count(*)::int from storage.objects where bucket_id = 'evidence-private'), 0, 'company B cannot read company A evidence files');
reset role;

select * from finish();
rollback;
