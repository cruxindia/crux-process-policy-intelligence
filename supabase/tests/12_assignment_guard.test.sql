-- Interview assignment guard: scope immutability, status machine, who may change what.
begin;
select plan(9);

select tests.login('a_ops_head'); set local role authenticated;
insert into public.interview_campaigns (id, company_id, code, name, department_id, owner_membership_id, status)
values ('99999999-0000-4000-8000-000000000101', tests.company('ALPHA'), 'CAMP-G', 'Guard test', tests.dept('ALPHA','OPS'), tests.mid('a_ops_head'), 'active');
insert into public.interview_assignments (id, company_id, campaign_id, respondent_membership_id, department_id) values
  ('99999999-0000-4000-8000-000000000102', tests.company('ALPHA'), '99999999-0000-4000-8000-000000000101', tests.mid('a_ops_emp'), tests.dept('ALPHA','OPS'));
insert into public.interview_assignments (id, company_id, campaign_id, respondent_membership_id, department_id, process_id) values
  ('99999999-0000-4000-8000-000000000103', tests.company('ALPHA'), '99999999-0000-4000-8000-000000000101', tests.mid('a_ops_emp'), tests.dept('ALPHA','OPS'), tests.proc('ALPHA','OPS-P01'));
select lives_ok($$ update public.interview_assignments set department_id = tests.dept('ALPHA','OPS-N')
                    where id = '99999999-0000-4000-8000-000000000102' $$, 'manager can move an unstarted assignment within their scope');
select throws_ok($$ update public.interview_assignments set campaign_id = gen_random_uuid() where id = '99999999-0000-4000-8000-000000000102' $$,
                 'P0001', null, 'campaign of an assignment cannot change');
reset role;

select tests.login('a_ops_emp'); set local role authenticated;
select throws_ok($$ update public.interview_assignments set department_id = tests.dept('ALPHA','FIN') where id = '99999999-0000-4000-8000-000000000103' $$,
                 'P0001', null, 'respondent cannot move their assignment to another scope');
select throws_ok($$ update public.interview_assignments set status = 'cancelled' where id = '99999999-0000-4000-8000-000000000103' $$,
                 'P0001', null, 'respondent cannot cancel an assignment');
select public.start_interview_session('99999999-0000-4000-8000-000000000103');
select throws_ok($$ update public.interview_assignments set status = 'completed' where id = '99999999-0000-4000-8000-000000000103' $$,
                 'P0001', null, 'cannot mark completed while the session is still open');
update public.interview_sessions set status = 'submitted' where assignment_id = '99999999-0000-4000-8000-000000000103';
select lives_ok($$ update public.interview_assignments set status = 'completed' where id = '99999999-0000-4000-8000-000000000103' $$,
                'respondent marks completed after submitting');
select throws_ok($$ update public.interview_assignments set status = 'in_progress' where id = '99999999-0000-4000-8000-000000000103' $$,
                 'P0001', null, 'completed cannot go back to in progress unless the session is reopened');
reset role;

select tests.login('a_ops_head'); set local role authenticated;
select throws_ok($$ update public.interview_assignments set process_id = null where id = '99999999-0000-4000-8000-000000000103' $$,
                 'P0001', null, 'manager cannot change scope after the interview started');
select lives_ok($$ update public.interview_assignments set status = 'cancelled' where id = '99999999-0000-4000-8000-000000000102' $$,
                'manager can cancel an unstarted assignment');
reset role;

select * from finish();
rollback;
