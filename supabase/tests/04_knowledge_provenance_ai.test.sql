-- FR-09 provenance; AC-02 source IDs exist and are accessible; AC-03 inference labelled; AC-06 AI cannot verify; AC-10 provider policy.
begin;
select plan(19);

-- Fixture: an answered interview in OPS (as postgres).
insert into public.interview_campaigns (id, company_id, code, name, department_id, owner_membership_id, status)
values ('33333333-0000-4000-8000-000000000001', tests.company('ALPHA'), 'CAMP-K', 'K', tests.dept('ALPHA','OPS'), tests.mid('a_ops_head'), 'active');
insert into public.interview_assignments (id, company_id, campaign_id, respondent_membership_id, department_id, process_id)
values ('33333333-0000-4000-8000-000000000002', tests.company('ALPHA'), '33333333-0000-4000-8000-000000000001', tests.mid('a_ops_emp'),
        tests.dept('ALPHA','OPS'), tests.proc('ALPHA','OPS-P01'));
insert into public.interview_sessions (id, company_id, assignment_id) values ('33333333-0000-4000-8000-000000000003', tests.company('ALPHA'), '33333333-0000-4000-8000-000000000002');
insert into public.interview_questions (id, company_id, session_id, seq, field_key, question_text, generated_by)
values ('33333333-0000-4000-8000-000000000004', tests.company('ALPHA'), '33333333-0000-4000-8000-000000000003', 1, 'process.steps', 'Describe the steps', 'template');
insert into public.interview_answers (id, company_id, question_id, answer_text, answered_by_membership_id)
values ('33333333-0000-4000-8000-000000000005', tests.company('ALPHA'), '33333333-0000-4000-8000-000000000004',
        'We log the request, check completeness, then assign a coordinator', tests.mid('a_ops_emp'));
-- A FIN evidence file the AI service is NOT allowed to read? (AI_SERVICE has company-wide evidence.read but no confidential clearance)
insert into public.evidence_files (id, company_id, department_id, title, storage_path, sha256, mime_type, size_bytes, classification, uploaded_by_membership_id)
values ('33333333-0000-4000-8000-000000000006', tests.company('ALPHA'), tests.dept('ALPHA','FIN'), 'FIN ledger extract', 'fin/x.pdf',
        repeat('a', 64), 'application/pdf', 10, 'confidential', tests.mid('a_fin_head'));

-- AC-10: provider policy (as the AI service identity)
select tests.login('a_ai', 'ai'); set local role authenticated;
select throws_ok($$ insert into public.ai_runs (company_id, capability, provider, model, prompt_version_id, data_classification)
                    select tests.company('ALPHA'), 'answer_extraction', 'gemini_free', 'gemini-x', id, 'internal'
                      from public.prompt_versions where company_id = tests.company('ALPHA') $$,
                 'P0001', null, 'AC-10: free hosted tier refused internal/confidential interview data');
select throws_ok($$ insert into public.ai_runs (company_id, capability, provider, model, prompt_version_id, data_classification)
                    select tests.company('ALPHA'), 'answer_extraction', 'unknown_vendor', 'm', id, 'public'
                      from public.prompt_versions where company_id = tests.company('ALPHA') $$,
                 'P0001', null, 'AC-10: unapproved provider refused (no silent fallback)');
select throws_ok($$ insert into public.ai_runs (company_id, capability, provider, model, prompt_version_id, data_classification)
                    select tests.company('ALPHA'), 'answer_extraction', 'local_ollama', 'm', id, 'restricted'
                      from public.prompt_versions where company_id = tests.company('ALPHA') $$,
                 'P0001', null, 'AC-10: restricted data refused above provider maximum');
insert into public.ai_runs (id, company_id, capability, provider, model, prompt_version_id, data_classification, context_source_ids, idempotency_key)
select '33333333-0000-4000-8000-000000000007', tests.company('ALPHA'), 'answer_extraction', 'local_ollama', 'llama-local', id, 'internal',
       array['33333333-0000-4000-8000-000000000005'::uuid], 'extract:33333333-0000-4000-8000-000000000005'
  from public.prompt_versions where company_id = tests.company('ALPHA');
select pass('local provider accepted for internal data, with prompt version and context ids');
select throws_ok($$ insert into public.ai_runs (company_id, capability, provider, model, prompt_version_id, data_classification, idempotency_key)
                    select tests.company('ALPHA'), 'answer_extraction', 'local_ollama', 'llama-local', id, 'internal', 'extract:33333333-0000-4000-8000-000000000005'
                      from public.prompt_versions where company_id = tests.company('ALPHA') $$,
                 '23505', null, 'AC-11: retried AI run with same idempotency key is not duplicated');

-- AI output enters only as AI-labelled draft claims (AC-03)
select throws_ok($$ insert into public.knowledge_records (company_id, record_type, title, claim_text, department_id, process_id, claim_origin, ai_run_id)
                    values (tests.company('ALPHA'), 'process_step', 't', 'c', tests.dept('ALPHA','OPS'), tests.proc('ALPHA','OPS-P01'),
                            'employee_statement', '33333333-0000-4000-8000-000000000007') $$,
                 '23514', null, 'AC-03: AI output cannot be labelled as an employee statement');
insert into public.knowledge_records (id, company_id, record_type, title, claim_text, department_id, process_id, claim_origin, ai_run_id, confidence, confidence_rationale)
values ('33333333-0000-4000-8000-000000000008', tests.company('ALPHA'), 'process_step', 'Log request', 'Request is logged first',
        tests.dept('ALPHA','OPS'), tests.proc('ALPHA','OPS-P01'), 'ai_extraction', '33333333-0000-4000-8000-000000000007', 0.80, 'Stated directly in answer');
select throws_ok($$ update public.knowledge_records set lifecycle_status = 'submitted' where id = '33333333-0000-4000-8000-000000000008' $$,
                 'P0001', null, 'AC-02: AI extraction without a supporting source cannot be submitted');
select throws_ok($$ insert into public.knowledge_sources (company_id, knowledge_record_id, source_type, evidence_file_id)
                    values (tests.company('ALPHA'), '33333333-0000-4000-8000-000000000008', 'evidence_file', '33333333-0000-4000-8000-000000000006') $$,
                 '42501', null, 'AC-02: cannot cite a source the caller cannot read');
select throws_ok($$ insert into public.knowledge_sources (company_id, knowledge_record_id, source_type, interview_answer_id)
                    values (tests.company('ALPHA'), '33333333-0000-4000-8000-000000000008', 'interview_answer', gen_random_uuid()) $$,
                 '42501', null, 'AC-02: cannot cite a non-existent source id (refused by access check)');
insert into public.knowledge_sources (company_id, knowledge_record_id, source_type, interview_answer_id, locator)
values (tests.company('ALPHA'), '33333333-0000-4000-8000-000000000008', 'interview_answer', '33333333-0000-4000-8000-000000000005', 'sentence 1');
update public.knowledge_records set lifecycle_status = 'submitted' where id = '33333333-0000-4000-8000-000000000008';
reset role;
select throws_ok($$ insert into public.knowledge_sources (company_id, knowledge_record_id, source_type, interview_answer_id)
                    values (tests.company('ALPHA'), '33333333-0000-4000-8000-000000000008', 'interview_answer', gen_random_uuid()) $$,
                 '23503', null, 'AC-02: non-existent source id refused by FK even for privileged callers');
select tests.login('a_ai', 'ai'); set local role authenticated;
select is((select lifecycle_status from public.knowledge_records where id = '33333333-0000-4000-8000-000000000008'), 'submitted',
          'sourced AI extraction can be submitted');
insert into public.knowledge_records (id, company_id, record_type, title, claim_text, department_id, process_id, claim_origin, ai_run_id)
values ('33333333-0000-4000-8000-000000000009', tests.company('ALPHA'), 'risk', 'Possible backlog', 'Backlog likely at month end',
        tests.dept('ALPHA','OPS'), tests.proc('ALPHA','OPS-P01'), 'ai_inference', '33333333-0000-4000-8000-000000000007');
select pass('AC-03: unsupported inference is stored, labelled ai_inference');
reset role;

-- AC-06: AI identity cannot verify even if (mis)configured with knowledge.verify
insert into public.role_permissions (company_id, role_id, permission_code)
select company_id, id, 'knowledge.verify' from public.roles where company_id = tests.company('ALPHA') and code = 'AI_SERVICE';
update public.knowledge_records set lifecycle_status = 'under_review' where id = '33333333-0000-4000-8000-000000000008';
select tests.login('a_ai', 'ai'); set local role authenticated;
select throws_ok($$ update public.knowledge_records set lifecycle_status = 'verified' where id = '33333333-0000-4000-8000-000000000008' $$,
                 'P0001', null, 'AC-06: AI service cannot verify a fact even with the permission');
reset role;
-- A human using a token marked actor_type=ai is also refused
select tests.login('a_ops_head', 'ai'); set local role authenticated;
select throws_ok($$ update public.knowledge_records set lifecycle_status = 'verified' where id = '33333333-0000-4000-8000-000000000008' $$,
                 'P0001', null, 'AC-06: requests marked as AI actor are refused human-only transitions');
reset role;

-- Human verification
select tests.login('a_ops_head'); set local role authenticated;
update public.knowledge_records set lifecycle_status = 'verified' where id = '33333333-0000-4000-8000-000000000008';
select is((select verified_by_membership_id from public.knowledge_records where id = '33333333-0000-4000-8000-000000000008'),
          tests.mid('a_ops_head'), 'human verification records the verifier');
select throws_ok($$ update public.knowledge_records set claim_text = 'rewritten' where id = '33333333-0000-4000-8000-000000000008' $$,
                 'P0001', null, 'claim text cannot be edited after creation');
select throws_ok($$ delete from public.knowledge_sources where knowledge_record_id = '33333333-0000-4000-8000-000000000008' $$,
                 'P0001', null, 'source links of a verified record cannot be removed');
reset role;
update public.knowledge_records set lifecycle_status = 'submitted' where id = '33333333-0000-4000-8000-000000000009';
update public.knowledge_records set lifecycle_status = 'under_review' where id = '33333333-0000-4000-8000-000000000009';
select tests.login('a_ops_head'); set local role authenticated;
select throws_ok($$ update public.knowledge_records set lifecycle_status = 'verified' where id = '33333333-0000-4000-8000-000000000009' $$,
                 'P0001', null, 'AC-03: an AI inference can never be verified as fact');
-- Supersession: new record referencing old, then old → superseded
insert into public.knowledge_records (id, company_id, record_type, title, claim_text, department_id, process_id, claim_origin, supersedes_record_id)
values ('33333333-0000-4000-8000-00000000000a', tests.company('ALPHA'), 'process_step', 'Log request (corrected)',
        'Request is logged in the portal first', tests.dept('ALPHA','OPS'), tests.proc('ALPHA','OPS-P01'), 'employee_statement',
        '33333333-0000-4000-8000-000000000008');
update public.knowledge_records set lifecycle_status = 'superseded' where id = '33333333-0000-4000-8000-000000000008';
select is((select claim_text from public.knowledge_records where id = '33333333-0000-4000-8000-000000000008'), 'Request is logged first',
          'superseded record keeps its original text');
reset role;

select * from finish();
rollback;
