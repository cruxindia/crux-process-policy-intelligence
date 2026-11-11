-- FR-07 structured process versions; FR-11 map validation; immutability after approval; MVP step 9.
begin;
select plan(14);

select tests.login('a_proc_owner'); set local role authenticated;
insert into public.process_versions (id, company_id, process_id, version_no, state_kind, trigger_text, output_text)
values ('55555555-0000-4000-8000-000000000001', tests.company('ALPHA'), tests.proc('ALPHA','OPS-P01'), 1, 'as_is', 'Client request received', null);
insert into public.process_steps (id, company_id, process_version_id, step_code, seq, step_type, name, actor_role_text, is_assumption) values
 ('55555555-0000-4000-8000-000000000011', tests.company('ALPHA'), '55555555-0000-4000-8000-000000000001', 'S0', 0, 'start', 'Request received', null, false),
 ('55555555-0000-4000-8000-000000000012', tests.company('ALPHA'), '55555555-0000-4000-8000-000000000001', 'S1', 1, 'activity', 'Log request', 'Coordinator', false),
 ('55555555-0000-4000-8000-000000000013', tests.company('ALPHA'), '55555555-0000-4000-8000-000000000001', 'S2', 2, 'decision', 'Complete?', 'Coordinator', false),
 ('55555555-0000-4000-8000-000000000014', tests.company('ALPHA'), '55555555-0000-4000-8000-000000000001', 'S3', 3, 'activity', 'Assign', null, true),
 ('55555555-0000-4000-8000-000000000015', tests.company('ALPHA'), '55555555-0000-4000-8000-000000000001', 'S9', 9, 'end', 'Assigned', null, false),
 ('55555555-0000-4000-8000-000000000016', tests.company('ALPHA'), '55555555-0000-4000-8000-000000000001', 'SX', 99, 'activity', 'Orphan', 'X', false);
insert into public.process_edges (company_id, process_version_id, from_step_id, to_step_id, edge_type, condition_label) values
 (tests.company('ALPHA'), '55555555-0000-4000-8000-000000000001', '55555555-0000-4000-8000-000000000011', '55555555-0000-4000-8000-000000000012', 'sequence', null),
 (tests.company('ALPHA'), '55555555-0000-4000-8000-000000000001', '55555555-0000-4000-8000-000000000012', '55555555-0000-4000-8000-000000000013', 'sequence', null),
 (tests.company('ALPHA'), '55555555-0000-4000-8000-000000000001', '55555555-0000-4000-8000-000000000013', '55555555-0000-4000-8000-000000000014', 'decision_branch', 'Yes'),
 (tests.company('ALPHA'), '55555555-0000-4000-8000-000000000001', '55555555-0000-4000-8000-000000000014', '55555555-0000-4000-8000-000000000015', 'sequence', null);
select pass('process owner creates a draft version with steps and edges');

select throws_ok($$ insert into public.process_edges (company_id, process_version_id, from_step_id, to_step_id, edge_type)
                    values (tests.company('ALPHA'), '55555555-0000-4000-8000-000000000001', '55555555-0000-4000-8000-000000000013',
                            '55555555-0000-4000-8000-000000000015', 'decision_branch') $$,
                 '23514', null, 'decision branch needs a condition label');

select set_has($$ select issue_type || ':' || coalesce(step_code,'-') from public.process_map_issues('55555555-0000-4000-8000-000000000001') $$,
  $$ values ('orphan_step:SX'), ('decision_branches:S2'), ('missing_owner:S3'), ('unverified_assumption:S3'),
            ('missing_output:-'), ('unreachable:SX'), ('unsourced_step:S1') $$,
  'map validation flags orphan, single-branch decision, missing owner, assumption, missing output, unreachable, unsourced');
select ok(not exists(select 1 from public.process_map_issues('55555555-0000-4000-8000-000000000001') where issue_type in ('missing_start','missing_end')),
          'start and end present → not flagged');
reset role;

-- A second version; cross-version edges are impossible.
select tests.login('a_proc_owner'); set local role authenticated;
insert into public.process_versions (id, company_id, process_id, version_no, state_kind)
values ('55555555-0000-4000-8000-000000000002', tests.company('ALPHA'), tests.proc('ALPHA','OPS-P01'), 2, 'to_be');
insert into public.process_steps (id, company_id, process_version_id, step_code, seq, step_type, name)
values ('55555555-0000-4000-8000-000000000021', tests.company('ALPHA'), '55555555-0000-4000-8000-000000000002', 'S0', 0, 'start', 'Start');
select throws_ok($$ insert into public.process_edges (company_id, process_version_id, from_step_id, to_step_id)
                    values (tests.company('ALPHA'), '55555555-0000-4000-8000-000000000002', '55555555-0000-4000-8000-000000000021',
                            '55555555-0000-4000-8000-000000000012') $$,
                 '23503', null, 'an edge cannot join steps of different versions');

-- Fix issues, submit, approve.
delete from public.process_steps where id = '55555555-0000-4000-8000-000000000016';
update public.process_versions set output_text = 'Request assigned to coordinator' where id = '55555555-0000-4000-8000-000000000001';
update public.process_versions set status = 'under_review' where id = '55555555-0000-4000-8000-000000000001';
select throws_ok($$ update public.process_versions set trigger_text = 'edited' where id = '55555555-0000-4000-8000-000000000001' $$,
                 'P0001', null, 'version content frozen once under review');
reset role;
select tests.login('a_ops_emp'); set local role authenticated;
update public.process_versions set status = 'approved' where id = '55555555-0000-4000-8000-000000000001';
select is((select status from public.process_versions where id = '55555555-0000-4000-8000-000000000001'), 'under_review',
          'employee without process.approve cannot approve (row not updatable)');
reset role;
select tests.login('a_proc_owner', 'ai'); set local role authenticated;
select throws_ok($$ update public.process_versions set status = 'approved' where id = '55555555-0000-4000-8000-000000000001' $$,
                 'P0001', null, 'AC-06: AI-marked request cannot approve a process version');
reset role;
select tests.login('a_proc_owner'); set local role authenticated;
update public.process_versions set status = 'approved' where id = '55555555-0000-4000-8000-000000000001';
select is((select approved_by_membership_id from public.process_versions where id = '55555555-0000-4000-8000-000000000001'),
          tests.mid('a_proc_owner'), 'human approval recorded');
select throws_ok($$ update public.process_steps set name = 'renamed' where id = '55555555-0000-4000-8000-000000000012' $$,
                 'P0001', null, 'steps of an approved version are immutable');
select throws_ok($$ delete from public.process_edges where process_version_id = '55555555-0000-4000-8000-000000000001' $$,
                 'P0001', null, 'edges of an approved version cannot be deleted');
update public.process_versions set status = 'active' where id = '55555555-0000-4000-8000-000000000001';
select is((select status from public.process_versions where id = '55555555-0000-4000-8000-000000000001'), 'active', 'approved version activated');
reset role;
-- Activating a newer AS-IS version supersedes the old one (exactly one active per kind)
insert into public.process_versions (id, company_id, process_id, version_no, state_kind)
values ('55555555-0000-4000-8000-000000000003', tests.company('ALPHA'), tests.proc('ALPHA','OPS-P01'), 3, 'as_is');
update public.process_versions set status = 'under_review' where id = '55555555-0000-4000-8000-000000000003';
select tests.login('a_proc_owner'); set local role authenticated;
update public.process_versions set status = 'approved' where id = '55555555-0000-4000-8000-000000000003';
update public.process_versions set status = 'active' where id = '55555555-0000-4000-8000-000000000003';
select is((select status from public.process_versions where id = '55555555-0000-4000-8000-000000000001'), 'superseded', 'previous active AS-IS superseded');
reset role;
select tests.login('a_fin_head'); set local role authenticated;
select is((select count(*)::int from public.process_steps), 0, 'FIN head cannot read OPS process steps');
reset role;

select * from finish();
rollback;
