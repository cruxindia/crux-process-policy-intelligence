-- FR-14 controlled documents; AC-06 AI cannot approve; AC-07 no publish before approvals; AC-08 published immutable;
-- AC-11 no duplicate publication; MVP steps 10–12.
begin;
select plan(26);

-- Fixture: a verified knowledge record to cite (as postgres; status walk done via trigger-permitted path)
insert into public.knowledge_records (id, company_id, record_type, title, claim_text, department_id, process_id, claim_origin, lifecycle_status)
values ('66666666-0000-4000-8000-000000000001', tests.company('ALPHA'), 'process_step', 'Log request', 'Request is logged in the portal',
        tests.dept('ALPHA','OPS'), tests.proc('ALPHA','OPS-P01'), 'management_decision', 'submitted');

select tests.login('a_ops_head'); set local role authenticated;
insert into public.documents (id, company_id, doc_code, title, document_type_id, owner_membership_id, department_id, process_id)
select '66666666-0000-4000-8000-000000000002', tests.company('ALPHA'), 'SOP-OPS-001', 'Synthetic request intake SOP', id,
       tests.mid('a_proc_owner'), tests.dept('ALPHA','OPS'), tests.proc('ALPHA','OPS-P01')
  from public.document_types where company_id = tests.company('ALPHA') and code = 'SOP';
insert into public.document_versions (id, company_id, document_id, version_no, body_markdown, change_summary, route_id)
select '66666666-0000-4000-8000-000000000003', tests.company('ALPHA'), '66666666-0000-4000-8000-000000000002', 99,
       '# SOP v1\n1. Log the request in the portal.', 'Initial draft', id
  from public.approval_routes where company_id = tests.company('ALPHA') and code = 'SOP-STD';
select is((select version_no from public.document_versions where id = '66666666-0000-4000-8000-000000000003'), 1,
          'version number is assigned by the server, not the client');
select throws_ok($$ update public.document_versions set status = 'in_review' where id = '66666666-0000-4000-8000-000000000003' $$,
                 'P0001', null, 'cannot enter review without a cited source');
insert into public.document_version_sources (company_id, version_id, knowledge_record_id)
values (tests.company('ALPHA'), '66666666-0000-4000-8000-000000000003', '66666666-0000-4000-8000-000000000001');
update public.document_versions set status = 'in_review' where id = '66666666-0000-4000-8000-000000000003';
select isnt((select content_sha256 from public.document_versions where id = '66666666-0000-4000-8000-000000000003'), null,
            'content hash fixed at submission');
select throws_ok($$ update public.document_versions set body_markdown = 'sneaky edit' where id = '66666666-0000-4000-8000-000000000003' $$,
                 'P0001', null, 'content frozen while in review');
-- AC-07: direct publish while in review
select throws_ok($$ update public.document_versions set status = 'published' where id = '66666666-0000-4000-8000-000000000003' $$,
                 'P0001', null, 'AC-07: cannot publish before all required approvals');
reset role;

-- Out-of-order and unauthorised approvals
select tests.login('a_approver'); set local role authenticated;
select throws_ok($$ insert into public.approval_decisions (company_id, version_id, step_no, decided_by_membership_id, decision)
                    values (tests.company('ALPHA'), '66666666-0000-4000-8000-000000000003', 3, tests.mid('a_approver'), 'approved') $$,
                 'P0001', null, 'step 3 cannot be approved before steps 1–2');
reset role;
select tests.login('a_admin'); set local role authenticated;
select is((select count(*)::int from public.document_versions), 0, 'technical admin cannot even see draft documents (no document permission)');
reset role;
select tests.login('a_ops_emp'); set local role authenticated;
select throws_ok($$ insert into public.approval_decisions (company_id, version_id, step_no, decided_by_membership_id, decision)
                    values (tests.company('ALPHA'), '66666666-0000-4000-8000-000000000003', 1, tests.mid('a_ops_emp'), 'approved') $$,
                 'P0001', null, 'employee cannot record an approval (no authority for the step)');
reset role;

-- AC-06: AI identity with document.review_owner still cannot approve
insert into public.role_permissions (company_id, role_id, permission_code)
select company_id, id, 'document.review_owner' from public.roles where company_id = tests.company('ALPHA') and code = 'AI_SERVICE';
select tests.login('a_ai', 'ai'); set local role authenticated;
select throws_ok($$ insert into public.approval_decisions (company_id, version_id, step_no, decided_by_membership_id, decision)
                    values (tests.company('ALPHA'), '66666666-0000-4000-8000-000000000003', 1, tests.mid('a_ai'), 'approved') $$,
                 'P0001', null, 'AC-06: AI cannot approve a document');
reset role;

-- Impersonation: approver records a decision in someone else's name
select tests.login('a_proc_owner'); set local role authenticated;
select throws_ok($$ insert into public.approval_decisions (company_id, version_id, step_no, decided_by_membership_id, decision)
                    values (tests.company('ALPHA'), '66666666-0000-4000-8000-000000000003', 1, tests.mid('a_approver'), 'approved') $$,
                 'P0001', null, 'cannot record a decision in another person''s name');
insert into public.approval_decisions (company_id, version_id, step_no, decided_by_membership_id, decision)
values (tests.company('ALPHA'), '66666666-0000-4000-8000-000000000003', 1, tests.mid('a_proc_owner'), 'approved');
select throws_ok($$ insert into public.approval_decisions (company_id, version_id, step_no, decided_by_membership_id, decision)
                    values (tests.company('ALPHA'), '66666666-0000-4000-8000-000000000003', 1, tests.mid('a_proc_owner'), 'approved') $$,
                 'P0001', null, 'same person cannot approve the same step twice');
reset role;
select tests.login('a_be_reviewer'); set local role authenticated;
insert into public.approval_decisions (company_id, version_id, step_no, decided_by_membership_id, decision)
values (tests.company('ALPHA'), '66666666-0000-4000-8000-000000000003', 2, tests.mid('a_be_reviewer'), 'approved');
select is((select status from public.document_versions where id = '66666666-0000-4000-8000-000000000003'), 'in_review',
          'still in review until the final step');
reset role;
select tests.login('a_approver'); set local role authenticated;
insert into public.approval_decisions (company_id, version_id, step_no, decided_by_membership_id, decision)
values (tests.company('ALPHA'), '66666666-0000-4000-8000-000000000003', 3, tests.mid('a_approver'), 'approved');
select is((select status from public.document_versions where id = '66666666-0000-4000-8000-000000000003'), 'approved',
          'all route steps approved → version approved');
reset role;

-- AI cannot publish; approver publishes.
select tests.login('a_approver', 'ai'); set local role authenticated;
select throws_ok($$ update public.document_versions set status = 'published' where id = '66666666-0000-4000-8000-000000000003' $$,
                 'P0001', null, 'AC-06: AI-marked request cannot publish');
reset role;
select tests.login('a_approver'); set local role authenticated;
update public.document_versions set status = 'published' where id = '66666666-0000-4000-8000-000000000003';
select is((select published_by_membership_id from public.document_versions where id = '66666666-0000-4000-8000-000000000003'),
          tests.mid('a_approver'), 'publisher recorded');
-- AC-08
select throws_ok($$ update public.document_versions set body_markdown = 'overwrite' where id = '66666666-0000-4000-8000-000000000003' $$,
                 'P0001', null, 'AC-08: published content cannot be overwritten');
select throws_ok($$ update public.document_versions set effective_date = current_date + 30 where id = '66666666-0000-4000-8000-000000000003' $$,
                 'P0001', null, 'AC-08: published metadata cannot be changed');
reset role;
select throws_ok($$ update public.document_versions set body_markdown = 'overwrite' where id = '66666666-0000-4000-8000-000000000003' $$,
                 'P0001', null, 'AC-08: even the database owner cannot overwrite a published version');
select throws_ok($$ delete from public.document_versions where id = '66666666-0000-4000-8000-000000000003' $$,
                 'P0001', null, 'AC-08: published version cannot be deleted');

-- Acknowledgement: employee reads and acknowledges published version, only for self.
select tests.login('a_ops_emp'); set local role authenticated;
select ok(exists(select 1 from public.document_versions where id = '66666666-0000-4000-8000-000000000003'), 'employee can read the published SOP');
insert into public.document_acknowledgements (company_id, version_id, membership_id)
values (tests.company('ALPHA'), '66666666-0000-4000-8000-000000000003', tests.mid('a_ops_emp'));
select throws_ok($$ insert into public.document_acknowledgements (company_id, version_id, membership_id)
                    values (tests.company('ALPHA'), '66666666-0000-4000-8000-000000000003', tests.mid('a_ops_head')) $$,
                 'P0001', null, 'cannot acknowledge on behalf of someone else');
reset role;

-- Version 2 → emergency publish without authority fails; with approvals flow, v1 becomes superseded.
select tests.login('a_ops_head'); set local role authenticated;
insert into public.document_versions (id, company_id, document_id, body_markdown, change_summary, route_id)
select '66666666-0000-4000-8000-000000000004', tests.company('ALPHA'), '66666666-0000-4000-8000-000000000002',
       '# SOP v2', 'Clarified step 1', id from public.approval_routes where company_id = tests.company('ALPHA') and code = 'SOP-STD';
select throws_ok($$ update public.document_versions set status = 'published', is_emergency = true, emergency_reason = 'urgent'
                     where id = '66666666-0000-4000-8000-000000000004' $$,
                 'P0001', null, 'emergency publication requires emergency authority');
insert into public.document_version_sources (company_id, version_id, knowledge_record_id)
values (tests.company('ALPHA'), '66666666-0000-4000-8000-000000000004', '66666666-0000-4000-8000-000000000001');
update public.document_versions set status = 'in_review' where id = '66666666-0000-4000-8000-000000000004';
reset role;
select tests.login('a_proc_owner'); set local role authenticated;
insert into public.approval_decisions (company_id, version_id, step_no, decided_by_membership_id, decision)
values (tests.company('ALPHA'), '66666666-0000-4000-8000-000000000004', 1, tests.mid('a_proc_owner'), 'approved');
reset role;
select tests.login('a_be_reviewer'); set local role authenticated;
insert into public.approval_decisions (company_id, version_id, step_no, decided_by_membership_id, decision)
values (tests.company('ALPHA'), '66666666-0000-4000-8000-000000000004', 2, tests.mid('a_be_reviewer'), 'approved');
reset role;
select tests.login('a_approver'); set local role authenticated;
insert into public.approval_decisions (company_id, version_id, step_no, decided_by_membership_id, decision)
values (tests.company('ALPHA'), '66666666-0000-4000-8000-000000000004', 3, tests.mid('a_approver'), 'approved');
update public.document_versions set status = 'published' where id = '66666666-0000-4000-8000-000000000004';
select is((select status from public.document_versions where id = '66666666-0000-4000-8000-000000000003'), 'superseded', 'v1 superseded when v2 publishes');
select is((select supersedes_version_id from public.document_versions where id = '66666666-0000-4000-8000-000000000004'),
          '66666666-0000-4000-8000-000000000003'::uuid, 'v2 links to the version it supersedes');
select is((select count(*)::int from public.document_versions where document_id = '66666666-0000-4000-8000-000000000002' and status = 'published'), 1,
          'AC-11: exactly one published version per document');
reset role;
select is((select count(*)::int from public.audit_events where object_type = 'approval_decisions'), 6, 'every approval decision is audited');

select * from finish();
rollback;
