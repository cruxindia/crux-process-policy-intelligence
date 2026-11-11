-- FR-05/06 interview flow; AC-01 employee answer unchanged after correction; NFR-05 resume.
begin;
select plan(17);

-- Department head sets up a campaign and assigns the OPS employee.
select tests.login('a_ops_head'); set local role authenticated;
insert into public.interview_campaigns (id, company_id, code, name, department_id, owner_membership_id, status)
values ('22222222-0000-4000-8000-000000000001', tests.company('ALPHA'), 'CAMP-1', 'Synthetic OPS discovery',
        tests.dept('ALPHA','OPS'), tests.mid('a_ops_head'), 'active');
insert into public.interview_assignments (id, company_id, campaign_id, respondent_membership_id, department_id, process_id)
values ('22222222-0000-4000-8000-000000000002', tests.company('ALPHA'), '22222222-0000-4000-8000-000000000001',
        tests.mid('a_ops_emp'), tests.dept('ALPHA','OPS'), tests.proc('ALPHA','OPS-P01'));
select pass('department head creates campaign and assignment');
reset role;

-- Respondent starts a session, gets a question, autosaves a draft, answers.
select tests.login('a_ops_emp'); set local role authenticated;
select ok(exists(select 1 from public.interview_assignments where id = '22222222-0000-4000-8000-000000000002'), 'respondent sees own assignment');
insert into public.interview_sessions (id, company_id, assignment_id)
values ('22222222-0000-4000-8000-000000000003', tests.company('ALPHA'), '22222222-0000-4000-8000-000000000002');
insert into public.interview_questions (id, company_id, session_id, seq, field_key, question_text, rationale, generated_by)
values ('22222222-0000-4000-8000-000000000004', tests.company('ALPHA'), '22222222-0000-4000-8000-000000000003', 1,
        'process.trigger', 'What starts this process?', 'Trigger is missing', 'template');
insert into public.interview_answer_drafts (company_id, question_id, draft_text)
values (tests.company('ALPHA'), '22222222-0000-4000-8000-000000000004', 'An email from the cl');
select is((select draft_text from public.interview_answer_drafts where question_id = '22222222-0000-4000-8000-000000000004'),
          'An email from the cl', 'resume: autosaved draft is retrievable');
select throws_ok($$ insert into public.interview_sessions (company_id, assignment_id)
                    values (tests.company('ALPHA'), '22222222-0000-4000-8000-000000000002') $$,
                 '23505', null, 'only one open session per assignment');
insert into public.interview_answers (id, company_id, question_id, answer_text, knowledge_basis, answered_by_membership_id)
values ('22222222-0000-4000-8000-000000000005', tests.company('ALPHA'), '22222222-0000-4000-8000-000000000004',
        'A request email from the client', 'direct', tests.mid('a_ops_emp'));
select is((select revision_no from public.interview_answers where id = '22222222-0000-4000-8000-000000000005'), 1, 'first answer is revision 1');

-- AC-01: answers cannot be edited or deleted, even by their author.
update public.interview_answers set answer_text = 'changed' where id = '22222222-0000-4000-8000-000000000005';
select is((select answer_text from public.interview_answers where id = '22222222-0000-4000-8000-000000000005'),
          'A request email from the client', 'AC-01: answer cannot be updated by its author (no update policy)');
select throws_ok($$ delete from public.interview_answers where id = '22222222-0000-4000-8000-000000000005' $$,
                 '42501', null, 'AC-01: answer cannot be deleted (no privilege)');
reset role;
select throws_ok($$ update public.interview_answers set answer_text = 'changed' where id = '22222222-0000-4000-8000-000000000005' $$,
                 'P0001', null, 'AC-01: even the database owner cannot overwrite an answer');

-- Correction = linked revision with reason; must supersede the latest.
select tests.login('a_ops_emp'); set local role authenticated;
select throws_ok($$ insert into public.interview_answers (company_id, question_id, answer_text, answered_by_membership_id, supersedes_answer_id)
                    values (tests.company('ALPHA'), '22222222-0000-4000-8000-000000000004', 'fix', tests.mid('a_ops_emp'),
                            '22222222-0000-4000-8000-000000000005') $$,
                 '23514', null, 'a revision without a reason is rejected');
insert into public.interview_answers (id, company_id, question_id, answer_text, answered_by_membership_id, supersedes_answer_id, revision_reason)
values ('22222222-0000-4000-8000-000000000006', tests.company('ALPHA'), '22222222-0000-4000-8000-000000000004',
        'A request email or a portal ticket from the client', tests.mid('a_ops_emp'), '22222222-0000-4000-8000-000000000005', 'Forgot portal');
select is((select answer_text from public.interview_answers where id = '22222222-0000-4000-8000-000000000005'),
          'A request email from the client', 'AC-01: original answer text unchanged after correction');
select is((select answer_text from public.interview_current_answers where question_id = '22222222-0000-4000-8000-000000000004'),
          'A request email or a portal ticket from the client', 'current-answer view returns latest revision');
select throws_ok($$ insert into public.interview_answers (company_id, question_id, answer_text, answered_by_membership_id, supersedes_answer_id, revision_reason)
                    values (tests.company('ALPHA'), '22222222-0000-4000-8000-000000000004', 'x', tests.mid('a_ops_emp'),
                            '22222222-0000-4000-8000-000000000005', 'stale') $$,
                 'P0001', null, 'a revision must supersede the latest revision (no forks)');
insert into public.interview_questions (id, company_id, session_id, seq, field_key, question_text, generated_by)
values ('22222222-0000-4000-8000-000000000007', tests.company('ALPHA'), '22222222-0000-4000-8000-000000000003', 2,
        'process.owner', 'Who owns approval of exceptions?', 'template');
select throws_ok($$ insert into public.interview_answers (company_id, question_id, answer_kind, answered_by_membership_id)
                    values (tests.company('ALPHA'), '22222222-0000-4000-8000-000000000007', 'refer_to_owner', tests.mid('a_ops_emp')) $$,
                 '23514', null, '"refer to owner" requires naming who');

update public.interview_sessions set status = 'submitted' where id = '22222222-0000-4000-8000-000000000003';
select throws_ok($$ insert into public.interview_answers (company_id, question_id, answer_text, answered_by_membership_id, supersedes_answer_id, revision_reason)
                    values (tests.company('ALPHA'), '22222222-0000-4000-8000-000000000004', 'late', tests.mid('a_ops_emp'),
                            '22222222-0000-4000-8000-000000000006', 'late edit') $$,
                 '42501', null, 'respondent cannot answer after submission');
reset role;

-- Another department cannot read the interview.
select tests.login('a_fin_head'); set local role authenticated;
select is((select count(*)::int from public.interview_answers), 0, 'FIN head cannot read OPS interview answers');
reset role;

-- Review: an AI/service identity cannot mark reviewed; a human reviewer can.
update public.interview_sessions set status = 'review_pending' where id = '22222222-0000-4000-8000-000000000003';
select tests.login('a_ai', 'ai'); set local role authenticated;
select throws_ok($$ update public.interview_sessions set status = 'reviewed' where id = '22222222-0000-4000-8000-000000000003' $$,
                 'P0001', null, 'AI service identity cannot complete an interview review');
reset role;
select tests.login('a_be_reviewer'); set local role authenticated;
update public.interview_sessions set status = 'reviewed' where id = '22222222-0000-4000-8000-000000000003';
select is((select reviewed_by_membership_id from public.interview_sessions where id = '22222222-0000-4000-8000-000000000003'),
          tests.mid('a_be_reviewer'), 'human review records the reviewer');
reset role;

select * from finish();
rollback;
