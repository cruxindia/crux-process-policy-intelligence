-- PPI-032: Company Operating Blueprint — leadership interview, curated entries, open questions, CTQs with maker-checker targets, versions.
begin;
select plan(31);

-- leadership interview set-up
select tests.login('a_ops_emp'); set local role authenticated;
select throws_ok($$ select public.blueprint_start_leadership(tests.company('ALPHA'), array[tests.mid('a_ops_head')]) $$, '42501', null,
                 'an employee cannot start the leadership interview');
reset role;
select tests.login('a_admin'); set local role authenticated;
select is((public.blueprint_my_rights(tests.company('ALPHA')) ->> 'manage')::boolean, true, 'company admin manages the blueprint');
select is(public.blueprint_start_leadership(tests.company('ALPHA'), array[tests.mid('a_ops_head'), tests.mid('a_fin_head')]), 2, 'two leaders invited');
select is(public.blueprint_start_leadership(tests.company('ALPHA'), array[tests.mid('a_ops_head')]), 0, 'inviting again adds nothing');
reset role;
select is((select count(*)::int from public.question_templates where company_id = tests.company('ALPHA') and scope_type = 'leadership'), 20, '20 leadership questions');
select is((select count(*)::int from public.interview_campaigns where company_id = tests.company('ALPHA') and purpose_kind = 'leadership'), 1, 'one leadership campaign');
select tests.login('a_ops_head'); set local role authenticated;
select lives_ok($$ select public.start_interview_session((select a.id from public.interview_assignments a join public.interview_campaigns c on c.id = a.campaign_id
                    where c.purpose_kind = 'leadership' and a.respondent_membership_id = tests.mid('a_ops_head'))) $$, 'the leader starts the interview');
select is((select count(*)::int from public.interview_questions q join public.interview_sessions s on s.id = q.session_id join public.interview_assignments a on a.id = s.assignment_id
           join public.interview_campaigns c on c.id = a.campaign_id where c.purpose_kind = 'leadership'), 20, 'and gets exactly the 20 leadership questions');
reset role;

-- AI proposals (service role writes): an AI entry must cite sources; an AI CTQ can never carry a target
insert into public.blueprint_entries (company_id, section, statement, source_kind, source_refs)
values (tests.company('ALPHA'), 'purpose', 'Verification services for lenders', 'ai_synthesis', '[{"ref":"S1"}]');
select throws_ok($$ insert into public.blueprint_entries (company_id, section, statement, source_kind, source_refs)
                    values (tests.company('ALPHA'), 'purpose', 'Uncited claim', 'ai_synthesis', '[]') $$, '23514', null, 'an AI entry without sources is impossible');
select throws_ok($$ insert into public.ctq_items (company_id, code, name, voice, measure, source_kind, target_value)
                    values (tests.company('ALPHA'), 'CTQ-90', 'Turnaround', 'voc', 'Share of cases within SLA', 'ai_synthesis', 95) $$, '23514', null,
                 'a proposed CTQ cannot carry a target');
select throws_ok($$ insert into public.ctq_items (company_id, code, name, voice, measure, source_kind, status, target_value)
                    values (tests.company('ALPHA'), 'CTQ-91', 'Turnaround', 'voc', 'Share of cases within SLA', 'ai_synthesis', 'approved', 95) $$, '23514', null,
                 'nor can anything write an approved target without a requester and a different approver');
insert into public.ctq_items (company_id, code, name, voice, measure, source_kind, source_refs) values
  (tests.company('ALPHA'), 'CTQ-01', 'Turnaround time', 'voc', 'Share of cases closed within the client SLA', 'ai_synthesis', '[{"ref":"S2"}]');
insert into public.blueprint_open_questions (company_id, section, question) values (tests.company('ALPHA'), 'risk_appetite', 'Which risks must never happen?');

-- visibility: employees see only confirmed / approved; curators see proposals
select tests.login('a_ops_emp'); set local role authenticated;
select is((select count(*)::int from public.blueprint_entries), 0, 'employees do not see unconfirmed proposals');
select is((select count(*)::int from public.ctq_items), 0, 'nor unapproved CTQs');
select is((select count(*)::int from public.blueprint_open_questions), 0, 'nor open questions not addressed to them');
select throws_ok($$ update public.blueprint_entries set status = 'confirmed' $$, '42501', null, 'blueprint tables are not writable directly');
reset role;

-- curation
select tests.login('a_admin'); set local role authenticated;
select throws_ok($$ select public.blueprint_decide_entry(tests.company('ALPHA'), (select id from public.blueprint_entries where section = 'purpose'), 'rejected', null, '') $$,
                 'P0001', null, 'rejecting needs a reason');
select lives_ok($$ select public.blueprint_decide_entry(tests.company('ALPHA'), (select id from public.blueprint_entries where section = 'purpose'), 'confirmed',
                    'Independent verification and investigation services for banks and NBFCs') $$, 'confirm with edited wording');
select is((select original_statement from public.blueprint_entries where section = 'purpose'), 'Verification services for lenders', 'the AI wording is kept');
select throws_ok($$ select public.blueprint_publish(tests.company('ALPHA'), 'v1') $$, 'P0001', null, 'cannot publish before the core sections are agreed');
select lives_ok($$ select public.blueprint_assign_question(tests.company('ALPHA'), (select id from public.blueprint_open_questions limit 1), tests.mid('a_fin_head')) $$,
                'an open question goes to a named leader');
reset role;
select tests.login('a_fin_head'); set local role authenticated;
select lives_ok($$ select public.blueprint_answer_question(tests.company('ALPHA'), (select id from public.blueprint_open_questions limit 1), 'Loss of client data must never happen.') $$,
                'the leader answers');
reset role;
select is((select status from public.blueprint_entries where source_kind = 'leadership_followup'), 'proposed', 'the answer becomes a proposed entry for review');

-- CTQ target maker-checker
select tests.login('a_admin'); set local role authenticated;
select throws_ok($$ select public.ctq_request_target(tests.company('ALPHA'), (select id from public.ctq_items where code = 'CTQ-01'), 95, null, 'short') $$,
                 'P0001', null, 'a target needs a reason (where it comes from)');
select lives_ok($$ select public.ctq_request_target(tests.company('ALPHA'), (select id from public.ctq_items where code = 'CTQ-01'), 95, '% within SLA',
                    'Agreed in the management review of November') $$, 'manager requests a target');
select throws_ok($$ select public.ctq_decide_target(tests.company('ALPHA'), (select id from public.ctq_items where code = 'CTQ-01'), 'approved') $$, '42501', null,
                 'nobody approves their own target');
reset role;
select tests.login('a_approver'); set local role authenticated;
select lives_ok($$ select public.ctq_decide_target(tests.company('ALPHA'), (select id from public.ctq_items where code = 'CTQ-01'), 'approved', 'OK') $$,
                'a second person approves');
select is((select status || ':' || target_value from public.ctq_items where code = 'CTQ-01'), 'approved:95', 'target approved');
reset role;

-- publish once the core is agreed; versions are immutable; everyone reads them
select tests.login('a_admin'); set local role authenticated;
select public.blueprint_add_entry(tests.company('ALPHA'), s, 'Synthetic statement for ' || s) from unnest(array['business_model','services','customers','objectives']) s;
reset role;
select tests.login('a_approver'); set local role authenticated;
select is(public.blueprint_publish(tests.company('ALPHA'), 'First agreed blueprint'), 1, 'version 1 published');
select is((select jsonb_array_length(content -> 'ctqs') from public.blueprint_versions where version = 1), 1, 'the snapshot carries the approved CTQ with its target');
reset role;
select throws_ok($$ update public.blueprint_versions set note = 'x' $$, null, null, 'published versions cannot change');
select tests.login('a_ops_emp'); set local role authenticated;
select is((select count(*)::int from public.blueprint_versions), 1, 'every member can read the published blueprint');
reset role;

select * from finish();
rollback;
