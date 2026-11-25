-- PPI-047: bulk intake — admins only, duplicates refused, sensitive names forced, text only for governing documents.
begin;
select plan(14);
select tests.login('a_ops_emp'); set local role authenticated;
select throws_ok($$ select public.intake_begin(tests.company('ALPHA'), 'x') $$, '42501', null, 'an employee cannot upload documents');
reset role;

select tests.login('a_admin'); set local role authenticated;
create temp table b as select public.intake_begin(tests.company('ALPHA'), 'HR folder') id;
create temp table r as select public.intake_add(tests.company('ALPHA'), (select id from b), jsonb_build_array(
  jsonb_build_object('sha256', repeat('a', 64), 'file_name', 'Leave Policy.docx', 'folder', 'HR', 'ext', 'docx', 'size_bytes', 2000, 'category', 'governing', 'doc_type', 'policy', 'department_code', 'HR'),
  jsonb_build_object('sha256', repeat('b', 64), 'file_name', 'Appointment letter - X.docx', 'category', 'record', 'doc_type', 'employee letter'),
  jsonb_build_object('sha256', repeat('c', 64), 'file_name', 'Salary revision X.docx', 'category', 'governing', 'doc_type', 'policy'),
  jsonb_build_object('sha256', repeat('d', 64), 'file_name', 'Health and Safety Policy.docx', 'category', 'governing', 'doc_type', 'policy'))) j;
select is((select count(*)::int from jsonb_array_elements((select j from r)) x where x->>'status' = 'added'), 4, 'four files registered');
select is((select category from public.source_documents where sha256 = repeat('c', 64)), 'sensitive', 'a pay-related name is forced to sensitive by the server');
select is((select category from public.source_documents where sha256 = repeat('d', 64)), 'governing', 'a policy name may contain "health"');
select is((select (x->>'status') from jsonb_array_elements(public.intake_add(tests.company('ALPHA'), null, jsonb_build_array(
  jsonb_build_object('sha256', repeat('a', 64), 'file_name', 'Leave Policy (copy).docx', 'category', 'governing')))) x), 'duplicate', 'the same file twice is a duplicate');
select is(public.intake_known(tests.company('ALPHA'), array[repeat('a', 64), repeat('e', 64)]), array[repeat('a', 64)], 'known fingerprints are reported');
select lives_ok($$ select public.intake_put_text(tests.company('ALPHA'), (select id from public.source_documents where sha256 = repeat('a', 64)), '# Leave Policy\n1. Purpose: rules for leave. 2. Scope: all staff.') $$, 'governing text is accepted');
select is((select analysis_status from public.source_documents where sha256 = repeat('a', 64)), 'queued', 'and queued for analysis');
select throws_ok($$ select public.intake_put_text(tests.company('ALPHA'), (select id from public.source_documents where sha256 = repeat('b', 64)), 'Dear X, you are appointed as ...........') $$, '42501', null, 'record text is refused');
select throws_ok($$ select public.intake_put_text(tests.company('ALPHA'), (select id from public.source_documents where sha256 = repeat('c', 64)), 'Your salary is revised to ...........') $$, '42501', null, 'sensitive text is refused');
select throws_like($$ select public.intake_set_category(tests.company('ALPHA'), (select id from public.source_documents where sha256 = repeat('c', 64)), 'governing') $$, '%personal or legal record%', 'a sensitive name cannot be made governing');
select is(public.intake_set_category(tests.company('ALPHA'), (select id from public.source_documents where sha256 = repeat('a', 64)), 'record'), 'Saved.', 'an admin can recategorise');
select is((select count(*)::int from public.source_document_texts where company_id = tests.company('ALPHA')), 0, 'leaving governing deletes the text');
reset role;
select tests.login('b_admin'); set local role authenticated;
select is((select count(*)::int from public.source_documents where company_id = tests.company('ALPHA')), 0, 'another company sees nothing');
select * from finish();
rollback;
