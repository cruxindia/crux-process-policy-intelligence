-- FR-19 audit; NFR-06/AC-11 idempotent jobs; FR-16 dashboard respects RLS; SoD and approval invalidation on content change.
begin;
select plan(14);

-- Audit is append-only and permissioned.
insert into public.knowledge_records (id, company_id, record_type, title, claim_text, department_id, process_id, claim_origin)
values ('77777777-0000-4000-8000-000000000001', tests.company('ALPHA'), 'fact', 'A', 'A claim', tests.dept('ALPHA','OPS'), tests.proc('ALPHA','OPS-P01'), 'employee_statement');
select ok(exists(select 1 from public.audit_events where object_type = 'knowledge_records' and object_id = '77777777-0000-4000-8000-000000000001'),
          'knowledge insert audited');
select throws_ok($$ update public.audit_events set action = 'x' $$, 'P0001', null, 'audit events cannot be updated (even by owner)');
select throws_ok($$ delete from public.audit_events $$, 'P0001', null, 'audit events cannot be deleted (even by owner)');
select tests.login('a_admin'); set local role authenticated;
select ok((select count(*) from public.audit_events) > 0, 'admin with audit.read sees audit events');
reset role;
select tests.login('a_ops_head'); set local role authenticated;
select is((select count(*)::int from public.audit_events), 0, 'department head without audit.read sees no audit events');
reset role;
select tests.login('b_admin'); set local role authenticated;
select is((select count(*)::int from public.audit_events where company_id = tests.company('ALPHA')), 0, 'company B admin sees no company A audit');
reset role;

-- Background jobs (service role only).
select is(private.enqueue_job(tests.company('ALPHA'), 'reminder', 'clar:1:day1'), private.enqueue_job(tests.company('ALPHA'), 'reminder', 'clar:1:day1'),
          'AC-11: enqueueing the same job twice returns the same job');
select is((select count(*)::int from public.background_jobs where idempotency_key = 'clar:1:day1'), 1, 'AC-11: only one job row exists');
select is((select count(*)::int from private.claim_jobs('w1', 10)), 1, 'worker claims the ready job');
select is((select count(*)::int from private.claim_jobs('w2', 10)), 0, 'a second worker cannot claim a running job');
select tests.login('a_admin'); set local role authenticated;
select throws_ok($$ select private.enqueue_job(tests.company('ALPHA'), 'x', 'y') $$, '42501', null, 'end users cannot enqueue jobs directly');
reset role;

-- Dashboard view respects RLS.
select tests.login('a_ops_head'); set local role authenticated;
select set_eq($$ select process_code from public.dashboard_process_status $$, array['OPS-P01'], 'OPS head dashboard shows only OPS processes');
reset role;

-- SoD + approval invalidation: author cannot approve; edited content voids earlier approvals.
insert into public.role_permissions (company_id, role_id, permission_code)
select company_id, id, 'document.review_owner' from public.roles where company_id = tests.company('ALPHA') and code = 'DEPT_HEAD';
insert into public.documents (id, company_id, doc_code, title, document_type_id, owner_membership_id, department_id, process_id)
select '77777777-0000-4000-8000-000000000002', tests.company('ALPHA'), 'SOP-OPS-002', 'Synthetic SOP 2', id, tests.mid('a_ops_head'),
       tests.dept('ALPHA','OPS'), tests.proc('ALPHA','OPS-P01') from public.document_types where company_id = tests.company('ALPHA') and code = 'SOP';
select tests.login('a_ops_head'); set local role authenticated;
insert into public.document_versions (id, company_id, document_id, body_markdown, route_id)
select '77777777-0000-4000-8000-000000000003', tests.company('ALPHA'), '77777777-0000-4000-8000-000000000002', 'v1 text', id
  from public.approval_routes where company_id = tests.company('ALPHA') and code = 'SOP-STD';
insert into public.document_version_sources (company_id, version_id, knowledge_record_id)
values (tests.company('ALPHA'), '77777777-0000-4000-8000-000000000003', '77777777-0000-4000-8000-000000000001');
update public.document_versions set status = 'in_review' where id = '77777777-0000-4000-8000-000000000003';
select throws_ok($$ insert into public.approval_decisions (company_id, version_id, step_no, decided_by_membership_id, decision)
                    values (tests.company('ALPHA'), '77777777-0000-4000-8000-000000000003', 1, tests.mid('a_ops_head'), 'approved') $$,
                 'P0001', null, 'SoD: the author cannot approve their own document');
reset role;
select tests.login('a_proc_owner'); set local role authenticated;
insert into public.approval_decisions (company_id, version_id, step_no, decided_by_membership_id, decision)
values (tests.company('ALPHA'), '77777777-0000-4000-8000-000000000003', 1, tests.mid('a_proc_owner'), 'approved');
reset role;
select tests.login('a_be_reviewer'); set local role authenticated;
insert into public.approval_decisions (company_id, version_id, step_no, decided_by_membership_id, decision, comment)
values (tests.company('ALPHA'), '77777777-0000-4000-8000-000000000003', 2, tests.mid('a_be_reviewer'), 'changes_requested', 'Add exception path');
reset role;
select tests.login('a_ops_head'); set local role authenticated;
update public.document_versions set body_markdown = 'v1 text + exception path' where id = '77777777-0000-4000-8000-000000000003';
update public.document_versions set status = 'in_review' where id = '77777777-0000-4000-8000-000000000003';
select is(private.step_approvals(tests.company('ALPHA'), '77777777-0000-4000-8000-000000000003', 1), 0,
          'edited content voids the earlier step-1 approval (approvals bind to content hash)');
reset role;

select * from finish();
rollback;
