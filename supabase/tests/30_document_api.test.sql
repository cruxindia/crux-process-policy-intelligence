-- PPI-041: document API + embed — keys shown once/hashed, explicit release, classification rules, logging, rate limit, revocation.
begin;
select plan(22);

-- three approved documents (public, internal, confidential) and one awaiting approval
insert into public.board_cases (id, company_id, kind, doc_type, title, classification, status, created_by_membership_id, decided_at) values
  ('d0c00000-0000-4000-8000-000000000001', tests.company('ALPHA'), 'document_draft', 'policy', 'Customer complaints policy', 'public', 'approved', tests.mid('a_admin'), now()),
  ('d0c00000-0000-4000-8000-000000000002', tests.company('ALPHA'), 'document_draft', 'sop', 'Field visit SOP', 'internal', 'approved', tests.mid('a_admin'), now()),
  ('d0c00000-0000-4000-8000-000000000003', tests.company('ALPHA'), 'document_draft', 'policy', 'Pricing policy', 'confidential', 'approved', tests.mid('a_admin'), now()),
  ('d0c00000-0000-4000-8000-000000000004', tests.company('ALPHA'), 'document_draft', 'policy', 'Draft policy', 'public', 'awaiting_approval', tests.mid('a_admin'), null);
insert into public.board_outputs (company_id, case_id, version, title, body_md) values
  (tests.company('ALPHA'), 'd0c00000-0000-4000-8000-000000000001', 1, 'Complaints policy v1', '# Complaints\nold'),
  (tests.company('ALPHA'), 'd0c00000-0000-4000-8000-000000000001', 2, 'Complaints policy', '# Complaints\nWe reply within 2 days.'),
  (tests.company('ALPHA'), 'd0c00000-0000-4000-8000-000000000002', 1, 'Field visit SOP', '# Field visit'),
  (tests.company('ALPHA'), 'd0c00000-0000-4000-8000-000000000003', 1, 'Pricing', '# Secret'),
  (tests.company('ALPHA'), 'd0c00000-0000-4000-8000-000000000004', 1, 'Draft', '# Draft');
create temp table k (key text); grant all on k to authenticated;

select tests.login('a_ops_emp'); set local role authenticated;
select throws_ok($$ select public.company_create_api_key(tests.company('ALPHA'), 'Website') $$, '42501', null, 'employees cannot create API keys');
reset role;

select tests.login('a_admin'); set local role authenticated;
insert into k select public.company_create_api_key(tests.company('ALPHA'), 'Website') ->> 'key';
select matches((select key from k), '^ppi_[0-9a-f]{48}$', 'the admin gets a key once');
select is((select count(*)::int from public.company_api_keys where name = 'Website'), 1, 'the key is listed');
select throws_ok($$ select key_hash from public.company_api_keys $$, '42501', null, 'not even the admin can read the stored hash');
select lives_ok($$ select public.company_release_document(tests.company('ALPHA'), 'd0c00000-0000-4000-8000-000000000001', 'complaints-policy', true) $$, 'a public document released with website embed');
select lives_ok($$ select public.company_release_document(tests.company('ALPHA'), 'd0c00000-0000-4000-8000-000000000002', 'field-visit-sop', false) $$, 'an internal document released for the API');
select throws_ok($$ select public.company_release_document(tests.company('ALPHA'), 'd0c00000-0000-4000-8000-000000000002', 'field-visit-sop', true) $$, 'P0001', null, 'internal documents cannot be embedded on a website');
select throws_ok($$ select public.company_release_document(tests.company('ALPHA'), 'd0c00000-0000-4000-8000-000000000003', 'pricing', false) $$, 'P0001', null, 'confidential documents are never released');
select throws_ok($$ select public.company_release_document(tests.company('ALPHA'), 'd0c00000-0000-4000-8000-000000000004', 'draft', false) $$, 'P0001', null, 'unapproved documents cannot be released');
select throws_ok($$ select public.company_release_document(tests.company('ALPHA'), 'd0c00000-0000-4000-8000-000000000002', 'complaints-policy', false) $$, 'P0001', null, 'web names are unique');
select throws_ok($$ select public.doc_api((select key from k), null, null) $$, '42501', null, 'browsers cannot call the API function directly');
reset role;

-- the API (service role path)
select is((public.doc_api((select key from k), null, null) -> 'documents' -> 0 ->> 'slug'), 'complaints-policy', 'list: released documents only');
select is(jsonb_array_length(public.doc_api((select key from k), null, null) -> 'documents'), 2, 'list: exactly the two released documents');
select is((public.doc_api((select key from k), null, 'complaints-policy') -> 'document' ->> 'body_markdown'), E'# Complaints\\nWe reply within 2 days.', 'get: the latest approved version');
select is((public.doc_api((select key from k), null, 'field-visit-sop') ->> 'status')::int, 200, 'get: internal document via API key');
select is((public.doc_api('ppi_' || repeat('0', 48), null, 'complaints-policy') ->> 'status')::int, 401, 'a wrong key is refused');
select is((public.doc_api(null, 'ALPHA', 'complaints-policy') ->> 'status')::int, 200, 'embed: public + embeddable works without a key');
select is((public.doc_api(null, 'ALPHA', 'field-visit-sop') ->> 'status')::int, 404, 'embed: an internal document is not reachable without a key');
select is((select count(*)::int from public.document_api_calls where company_id = tests.company('ALPHA')), 6, 'every call with a valid key or company is logged (no content); unknown keys are not attributed');

-- reclassification after release closes access at once
update public.board_cases set classification = 'confidential' where id = 'd0c00000-0000-4000-8000-000000000002';
select is((public.doc_api((select key from k), null, 'field-visit-sop') ->> 'status')::int, 404, 'a document re-classified confidential disappears from the API');

select tests.login('a_admin'); set local role authenticated;
select lives_ok($$ select public.company_revoke_api_key(tests.company('ALPHA'), (select id from public.company_api_keys where name = 'Website')) $$, 'the admin revokes the key');
reset role;
select is((public.doc_api((select key from k), null, null) ->> 'status')::int, 401, 'a revoked key stops working immediately');

select * from finish();
rollback;
