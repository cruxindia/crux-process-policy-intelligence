-- PPI-024 discovery artefacts + PPI-025 AI connections, Vault access and the saved-work queue.
begin;
select plan(21);

insert into public.interview_campaigns (id, company_id, code, name, department_id, owner_membership_id, status, question_scopes, interview_mode)
values ('99999999-0000-4000-8000-000000000601', tests.company('ALPHA'), 'DISC-1', 'Discovery', tests.dept('ALPHA','OPS'), tests.mid('a_ops_head'), 'active', '{}', 'discovery');
insert into public.interview_assignments (id, company_id, campaign_id, respondent_membership_id, department_id)
values ('99999999-0000-4000-8000-000000000602', tests.company('ALPHA'), '99999999-0000-4000-8000-000000000601', tests.mid('a_ops_emp'), tests.dept('ALPHA','OPS'));
insert into public.interview_sessions (id, company_id, assignment_id) values ('99999999-0000-4000-8000-000000000603', tests.company('ALPHA'), '99999999-0000-4000-8000-000000000602');
insert into public.prompt_versions (id, company_id, prompt_key, version, purpose, template_sha256, output_schema, status)
values ('99999999-0000-4000-8000-000000000604', tests.company('ALPHA'), 'interview.discovery', 1, 'test', repeat('d', 64), '{}', 'active');
insert into public.ai_runs (id, company_id, capability, provider, model, prompt_version_id, data_classification, status)
values ('99999999-0000-4000-8000-000000000605', tests.company('ALPHA'), 'interview_followup', 'local_ollama', 'm', '99999999-0000-4000-8000-000000000604', 'internal', 'succeeded');
insert into public.discovery_profiles (company_id, session_id, membership_id, profile, stage)
values (tests.company('ALPHA'), '99999999-0000-4000-8000-000000000603', tests.mid('a_ops_emp'), '{"designation":{"value":"Executive"}}', 'responsibilities');
insert into public.discovered_processes (id, company_id, session_id, membership_id, process_key, name, flow, flow_version, first_ai_run_id, last_ai_run_id)
values ('99999999-0000-4000-8000-000000000606', tests.company('ALPHA'), '99999999-0000-4000-8000-000000000603', tests.mid('a_ops_emp'),
        'file_verification', 'File verification', '{"nodes":[{"id":"s1","type":"start","label":"Receive file"}],"edges":[]}', 1,
        '99999999-0000-4000-8000-000000000605', '99999999-0000-4000-8000-000000000605');
insert into public.discovered_process_flows (company_id, process_id, version, flow, ai_run_id)
values (tests.company('ALPHA'), '99999999-0000-4000-8000-000000000606', 1, '{"nodes":[],"edges":[]}', '99999999-0000-4000-8000-000000000605');

-- 1-2 schema
select throws_ok($$ insert into public.discovered_processes (company_id, session_id, membership_id, process_key, name)
                    values (tests.company('ALPHA'), '99999999-0000-4000-8000-000000000603', tests.mid('a_ops_emp'), 'BAD KEY!', 'x') $$,
                 '23514', null, 'process keys are slugs');
select throws_ok($$ update public.discovered_process_flows set version = 9 $$, 'P0001', null, 'flowchart history is append-only');

-- 3-7 employee: reads own discovery, cannot write it
select tests.login('a_ops_emp'); set local role authenticated;
select is((select count(*)::int from public.discovered_processes), 1, 'employee reads own discovered processes');
select is((select count(*)::int from public.discovered_process_flows), 1, 'employee reads own flowchart history');
select is((select stage from public.discovery_profiles), 'responsibilities', 'employee reads own discovery profile');
select throws_ok($$ update public.discovered_processes set name = 'forged' $$, '42501', null, 'employee cannot edit AI-derived processes');
select is((select count(*)::int from public.ai_provider_connections), 0, 'employee cannot see AI connections');
reset role;

-- 8 unrelated department head
select tests.login('a_fin_head'); set local role authenticated;
select is((select count(*)::int from public.discovered_processes), 0, 'another department''s head cannot read this discovery');
reset role;

-- 9-14 admin manages connections; cannot touch Vault reference or health
select tests.login('a_admin'); set local role authenticated;
select lives_ok($$ insert into public.ai_provider_connections (id, company_id, name, provider, policy_provider, model)
                   values ('99999999-0000-4000-8000-000000000607', tests.company('ALPHA'), 'Operations project', 'gemini', 'gemini_free', 'gemini-flash-lite-latest') $$,
                'administrator adds a connection');
select throws_ok($$ insert into public.ai_provider_connections (company_id, name, provider, policy_provider, vault_secret_id)
                    values (tests.company('ALPHA'), 'Sneaky', 'gemini', 'gemini_free', gen_random_uuid()) $$,
                 '42501', null, 'a Vault reference cannot be set from the browser');
select throws_ok($$ update public.ai_provider_connections set health = 'connected' $$, '42501', null, 'health is server-only');
select throws_ok($$ insert into public.ai_provider_connections (company_id, name, provider, policy_provider, health)
                    values (tests.company('ALPHA'), 'Fake healthy', 'gemini', 'gemini_free', 'connected') $$, '42501', null, 'health cannot be claimed on insert');
select lives_ok($$ insert into public.ai_connection_assignments (company_id, connection_id, department_id)
                   values (tests.company('ALPHA'), '99999999-0000-4000-8000-000000000607', tests.dept('ALPHA','OPS')) $$,
                'administrator assigns the connection to a department');
select throws_ok($$ insert into public.ai_provider_connections (company_id, name, provider, policy_provider)
                    values (tests.company('ALPHA'), 'Unknown policy', 'gemini', 'no_such_policy') $$,
                 '23503', null, 'a connection must use an approved provider policy');
select throws_ok($$ select public.ai_connection_get_key(tests.company('ALPHA'), '99999999-0000-4000-8000-000000000607') $$,
                 '42501', null, 'an administrator''s browser cannot read keys');
reset role;

-- 15 department head cannot manage connections
select tests.login('a_ops_head'); set local role authenticated;
select is((select count(*)::int from public.ai_provider_connections), 0, 'a department head cannot see AI connections');
reset role;

-- 16-17 server (service) stores and reads the key through Vault
select public.ai_connection_set_key(tests.company('ALPHA'), '99999999-0000-4000-8000-000000000607', 'AIzaSyntheticTestKey-0123456789abcd');
select is((select health from public.ai_provider_connections where id = '99999999-0000-4000-8000-000000000607'), 'configured', 'storing a key marks it configured');
select is(public.ai_connection_get_key(tests.company('ALPHA'), '99999999-0000-4000-8000-000000000607'), 'AIzaSyntheticTestKey-0123456789abcd', 'server reads the key from Vault');

-- 18 limit
update public.companies set ai_connection_limit = 1 where code = 'ALPHA';
select throws_ok($$ insert into public.ai_provider_connections (company_id, name, provider, policy_provider) values (tests.company('ALPHA'), 'Second', 'gemini', 'gemini_free') $$,
                 'P0001', null, 'the configurable connection limit is enforced');

-- 19-20 queue
insert into public.ai_jobs (company_id, membership_id, session_id, task_type, idempotency_key, run_after)
values (tests.company('ALPHA'), tests.mid('a_ops_emp'), '99999999-0000-4000-8000-000000000603', 'discovery_turn', 'turn:x', now() + interval '1 hour');
select tests.login('a_ops_emp'); set local role authenticated;
select is((select count(*)::int from public.ai_jobs), 1, 'employee sees own saved job');
select throws_ok($$ insert into public.ai_jobs (company_id, task_type, idempotency_key) values (tests.company('ALPHA'), 'discovery_turn', 'y') $$,
                 '42501', null, 'employees cannot create queue jobs');
reset role;

select * from finish();
rollback;
