-- PPI-049: departments from documents, stakeholders per department, department-scoped review.
begin;
select plan(11);
select tests.login('a_admin'); set local role authenticated;
select public.intake_add(tests.company('ALPHA'), null, jsonb_build_array(
  jsonb_build_object('sha256', repeat('7', 64), 'file_name', 'Travel Policy.docx', 'category', 'governing', 'department_code', 'FIN'),
  jsonb_build_object('sha256', repeat('8', 64), 'file_name', 'Recruitment Policy.docx', 'category', 'governing', 'department_code', 'HR')));
reset role;
insert into public.document_analyses (company_id, document_id, result) select tests.company('ALPHA'), id, '{}' from public.source_documents where sha256 in (repeat('7', 64), repeat('8', 64));
insert into public.doc_processes (company_id, document_id, analysis_id, name, department_code)
  select a.company_id, a.document_id, a.id, 'Travel claim', 'FIN' from public.document_analyses a join public.source_documents d on d.id = a.document_id where d.sha256 = repeat('7', 64);
insert into public.doc_findings (company_id, document_id, analysis_id, kind, severity, department_code, title)
  select a.company_id, a.document_id, a.id, 'gap', 'high', 'FIN', 'No approval limit for travel claims.' from public.document_analyses a join public.source_documents d on d.id = a.document_id where d.sha256 = repeat('7', 64)
  union all
  select a.company_id, a.document_id, a.id, 'gap', 'medium', 'HR', 'Interview panel not defined.' from public.document_analyses a join public.source_documents d on d.id = a.document_id where d.sha256 = repeat('8', 64);

create temp table hr as select id from public.doc_findings where company_id = tests.company('ALPHA') and department_code = 'HR';
grant select on hr to authenticated;
select tests.login('a_admin'); set local role authenticated;
select is(jsonb_array_length(public.doc_departments(tests.company('ALPHA'), true)), 2, 'two departments found in the documents');
select ok(exists (select 1 from public.departments where company_id = tests.company('ALPHA') and code = 'FIN'), 'a missing company department is created');
select lives_ok($$ select public.doc_stakeholder_add(tests.company('ALPHA'), 'FIN', tests.mid('a_ops_emp')) $$, 'the admin names a stakeholder for Finance');
select is((select (d->'stakeholders'->0->>'membership_id')::uuid from jsonb_array_elements(public.doc_departments(tests.company('ALPHA'))) d where d->>'code' = 'FIN'), tests.mid('a_ops_emp'), 'and sees them listed');
reset role;

select tests.login('a_ops_emp'); set local role authenticated;
select is((select count(*)::int from public.doc_findings where company_id = tests.company('ALPHA')), 1, 'the stakeholder sees only Finance findings');
select is((select count(*)::int from public.doc_processes where company_id = tests.company('ALPHA')), 1, 'and Finance processes');
select is((select count(*)::int from public.source_documents where company_id = tests.company('ALPHA')), 1, 'and only the document they come from');
select is((public.my_doc_reviews(tests.company('ALPHA'))->0->>'open')::int, 1, 'their review area shows one open finding');
select lives_ok($$ select public.doc_finding_decide(tests.company('ALPHA'), (select id from public.doc_findings where department_code = 'FIN'), 'confirmed', 'Correct, no limit today') $$, 'they confirm a Finance finding');
select throws_ok($$ select public.doc_finding_decide(tests.company('ALPHA'), (select id from hr), 'confirmed') $$, '42501', null, 'but cannot decide another department''s');
select throws_ok($$ select public.doc_stakeholder_add(tests.company('ALPHA'), 'HR', tests.mid('a_ops_emp')) $$, '42501', null, 'and cannot name stakeholders');
select * from finish();
rollback;
