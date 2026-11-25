-- PPI-048: analysis queue, findings decisions, finalisation (missing documents, duplicates), AI data approvals.
begin;
select plan(17);
select private.ensure_pool_policies(tests.company('ALPHA'));
insert into auth.users (id, email) values (tests.uid('platform_owner'), 'platform_owner@example.invalid') on conflict do nothing;
insert into private.platform_admins (user_id, note) values (tests.uid('platform_owner'), 'test') on conflict do nothing;
select tests.login('platform_owner'); set local role authenticated;
create temp table v as select public.baseline_begin('T-DOCS', '1', 'Test', null, null, null, '{"Department Register":{"rows":2}}'::jsonb) id;
select public.baseline_add_rows((select id from v), 'Department Register', '[
  {"row_no":2,"code":"HR-001","title":"Leave Policy","department":"Human Resources","data":{"Audit Criticality":"High","What the document should contain":"Leave types; approval"}},
  {"row_no":3,"code":"FIN-001","title":"Expense Policy","department":"Finance & Accounts","data":{"Audit Criticality":"Critical","What the document should contain":"Limits; approval; receipts"}}]'::jsonb);
select public.baseline_finish((select id from v));
reset role;

select tests.login('a_admin'); set local role authenticated;
select public.adopt_baseline(tests.company('ALPHA'), (select id from v));
create temp table r as select public.intake_add(tests.company('ALPHA'), null, jsonb_build_array(
  jsonb_build_object('sha256', repeat('1', 64), 'file_name', 'Leave Policy v2.docx', 'category', 'governing'),
  jsonb_build_object('sha256', repeat('2', 64), 'file_name', 'Leave Policy final.docx', 'category', 'governing'))) j;
select public.intake_put_text(tests.company('ALPHA'), (select id from public.source_documents where sha256 = repeat('1', 64)), 'Leave policy text: purpose, scope, approval by manager.');
select public.intake_put_text(tests.company('ALPHA'), (select id from public.source_documents where sha256 = repeat('2', 64)), 'Leave policy text, final edition: purpose and scope.');
select throws_like($$ select public.doc_assessment_finalize(tests.company('ALPHA')) $$, '%still waiting for analysis%', 'nothing is called missing while documents wait');
select throws_ok($$ select public.doc_claim_next(tests.company('ALPHA')) $$, '42501', null, 'only the service claims work');
reset role;

-- the service claims and analyses (as doc-ai would)
select isnt(public.doc_claim_next(tests.company('ALPHA')), null, 'the service claims the next document');
select is((select count(*)::int from public.source_documents where company_id = tests.company('ALPHA') and analysis_status = 'running'), 1, 'one at a time');
insert into public.document_analyses (company_id, document_id, result)
  select tests.company('ALPHA'), id, '{}'::jsonb from public.source_documents where sha256 = repeat('1', 64);
insert into public.doc_register_links (company_id, document_id, register_item_id, coverage)
  select tests.company('ALPHA'), d.id, r.id, 'partial' from public.source_documents d, public.register_items r
   where d.sha256 = repeat('1', 64) and r.company_id = tests.company('ALPHA') and r.code = 'HR-001';
insert into public.doc_findings (company_id, document_id, analysis_id, kind, severity, title)
  select tests.company('ALPHA'), a.document_id, a.id, 'gap', 'high', 'Nobody approves leave above five days.' from public.document_analyses a where a.company_id = tests.company('ALPHA');
update public.source_documents set analysis_status = 'done' where company_id = tests.company('ALPHA');

select tests.login('a_admin'); set local role authenticated;
select is((public.doc_assessment_finalize(tests.company('ALPHA')) ->> 'missing')::int, 1, 'the uncovered checklist item becomes missing');
select is((select status from public.register_items where company_id = tests.company('ALPHA') and code = 'HR-001'), 'partial', 'a partly covered item is partial');
select is((select severity from public.doc_findings where company_id = tests.company('ALPHA') and kind = 'missing_document'), 'high', 'a critical missing document is high severity');
select is((select count(*)::int from public.doc_findings where company_id = tests.company('ALPHA') and kind = 'duplicate'), 1, 'two versions of the leave policy are reported');
select is((public.doc_assessment_finalize(tests.company('ALPHA')) ->> 'duplicate_groups')::int, 0, 'running it again adds nothing');
select throws_like($$ select public.doc_finding_decide(tests.company('ALPHA'), (select id from public.doc_findings where kind = 'gap'), 'rejected', '') $$, '%say why%', 'rejecting needs a reason');
select lives_ok($$ select public.doc_finding_decide(tests.company('ALPHA'), (select id from public.doc_findings where kind = 'gap'), 'confirmed') $$, 'a finding is confirmed');
select throws_like($$ select public.ai_policy_set(tests.company('ALPHA'), 'gemini_free', 'confidential', 'we accept the training terms', true) $$, '%never receive confidential%', 'a provider that trains on inputs never receives confidential data');
select throws_like($$ select public.ai_policy_set(tests.company('ALPHA'), 'gemini_free', 'internal', 'rule documents may go to Gemini free') $$, '%tick that you accept%', 'internal data to a training provider needs explicit acceptance');
select is(public.ai_policy_set(tests.company('ALPHA'), 'gemini_free', 'internal', 'Owner accepts training use for rule documents', true), 'Saved.', 'with acceptance it is recorded');
select is((select training_accepted_by_membership_id from public.ai_provider_policies where company_id = tests.company('ALPHA') and provider = 'gemini_free'), tests.mid('a_admin'), 'who accepted is recorded');
select is(public.ai_policy_set(tests.company('ALPHA'), 'groq_free', 'confidential', 'Zero data retention is switched on'), 'Saved.', 'a non-training provider can be approved for confidential');
reset role;
select tests.login('a_ops_emp'); set local role authenticated;
select is((select count(*)::int from public.doc_findings where company_id = tests.company('ALPHA')), 0, 'employees do not see findings yet');
select * from finish();
rollback;
