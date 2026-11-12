-- PPI-023: a training AI provider may receive internal data only with a recorded owner acceptance (D-045);
-- admin switch between fixed and AI interview for the join link.
begin;
select plan(13);

-- 1-3. Policy constraint
select throws_ok($$ insert into public.ai_provider_policies (company_id, provider, max_classification, may_train_on_inputs, terms_checked_on)
                    values (tests.company('ALPHA'), 'gemini_free_x', 'internal', true, current_date) $$,
                 '23514', null, 'training provider + internal data without a recorded acceptance is refused');
select throws_ok($$ insert into public.ai_provider_policies (company_id, provider, max_classification, may_train_on_inputs, terms_checked_on,
                      training_accepted_by_membership_id, training_accepted_on, training_acceptance_note)
                    values (tests.company('ALPHA'), 'gemini_free_y', 'confidential', true, current_date, tests.mid('a_admin'), current_date,
                            'Owner accepts Google may use interview data') $$,
                 '23514', null, 'even with acceptance, a training provider never gets confidential data');
update public.ai_provider_policies
   set max_classification = 'internal', training_accepted_by_membership_id = tests.mid('a_admin'),
       training_accepted_on = current_date, training_acceptance_note = 'Owner accepts Google may use interview data (synthetic test)'
 where company_id = tests.company('ALPHA') and provider = 'gemini_free';
select is((select max_classification from public.ai_provider_policies where company_id = tests.company('ALPHA') and provider = 'gemini_free'),
          'internal', 'with a recorded owner acceptance the free provider may take internal data');

-- 4-5. The run guard follows the policy
insert into public.prompt_versions (id, company_id, prompt_key, version, purpose, template_sha256, output_schema, status)
values ('99999999-0000-4000-8000-000000000501', tests.company('ALPHA'), 'interview.adaptive', 1, 'test', repeat('b', 64), '{}', 'active');
select lives_ok($$ insert into public.ai_runs (company_id, capability, provider, model, prompt_version_id, data_classification, status)
                   values (tests.company('ALPHA'), 'interview_followup', 'gemini_free', 'gemini-x', '99999999-0000-4000-8000-000000000501', 'internal', 'running') $$,
                'internal interview data may go to the accepted free provider');
select throws_ok($$ insert into public.ai_runs (company_id, capability, provider, model, prompt_version_id, data_classification, status)
                    values (tests.company('ALPHA'), 'interview_followup', 'gemini_free', 'gemini-x', '99999999-0000-4000-8000-000000000501', 'confidential', 'running') $$,
                 'P0001', null, 'confidential data is still refused');
select is((select count(*)::int from public.audit_events where object_type = 'ai_provider_policies' and company_id = tests.company('ALPHA')) >= 1,
          true, 'policy change is audited');

-- 7-13. Interview mode switch
insert into public.interview_campaigns (id, company_id, code, name, department_id, owner_membership_id, status, question_scopes, interview_mode)
values ('99999999-0000-4000-8000-000000000502', tests.company('ALPHA'), 'FIX-1', 'Fixed', tests.dept('ALPHA','OPS'), tests.mid('a_ops_head'), 'active', array['general'], 'fixed'),
       ('99999999-0000-4000-8000-000000000503', tests.company('ALPHA'), 'AI-1', 'AI', tests.dept('ALPHA','OPS'), tests.mid('a_ops_head'), 'draft', array['general'], 'adaptive');
insert into public.company_join_links (id, company_id, label, token_sha256, campaign_id, department_id, created_by_membership_id)
values ('99999999-0000-4000-8000-000000000504', tests.company('ALPHA'), 'Link', repeat('c', 64), '99999999-0000-4000-8000-000000000502',
        tests.dept('ALPHA','OPS'), tests.mid('a_admin'));

select tests.login('a_ops_emp'); set local role authenticated;
select throws_ok($$ select public.set_join_interview_mode(tests.company('ALPHA'), true) $$, '42501', null, 'an employee cannot switch the interview mode');
reset role;
select tests.login('a_ops_head'); set local role authenticated;
select throws_ok($$ select public.set_join_interview_mode(tests.company('ALPHA'), true) $$, '42501', null, 'a department head cannot switch it either');
reset role;
select tests.login('a_admin'); set local role authenticated;
select is(public.set_join_interview_mode(tests.company('ALPHA'), true), 'AI-1', 'administrator switches the join link to the AI interview');
reset role;
select is((select campaign_id from public.company_join_links where id = '99999999-0000-4000-8000-000000000504'),
          '99999999-0000-4000-8000-000000000503'::uuid, 'join link now starts the AI interview');
select is((select status from public.interview_campaigns where id = '99999999-0000-4000-8000-000000000503'), 'active', 'AI campaign activated');
select tests.login('a_admin'); set local role authenticated;
select is(public.set_join_interview_mode(tests.company('ALPHA'), false), 'FIX-1', 'administrator can switch back to the fixed questions');
reset role;
select is((select count(*)::int from public.audit_events where action in ('INTERVIEW_MODE_AI','INTERVIEW_MODE_FIXED') and company_id = tests.company('ALPHA')),
          2, 'both switches are audited');

select * from finish();
rollback;
