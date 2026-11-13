-- PPI-031: many people's interview descriptions consolidate into ONE company catalogue item; documents/reviews use all of them.
begin;
select plan(17);

select private.seed_blueprint_catalogue(tests.company('ALPHA'));
update public.catalogue_functions set department_id = tests.dept('ALPHA', 'OPS') where company_id = tests.company('ALPHA') and code = 'OPS';

insert into public.interview_campaigns (id, company_id, code, name, department_id, owner_membership_id, status, question_scopes, interview_mode)
values ('99999999-0000-4000-8000-000000000901', tests.company('ALPHA'), 'DISC-C', 'Discovery', tests.dept('ALPHA','OPS'), tests.mid('a_ops_head'), 'active', '{}', 'discovery');
insert into public.interview_assignments (id, company_id, campaign_id, respondent_membership_id, department_id) values
  ('99999999-0000-4000-8000-000000000902', tests.company('ALPHA'), '99999999-0000-4000-8000-000000000901', tests.mid('a_ops_emp'), tests.dept('ALPHA','OPS')),
  ('99999999-0000-4000-8000-000000000912', tests.company('ALPHA'), '99999999-0000-4000-8000-000000000901', tests.mid('a_ops_head'), tests.dept('ALPHA','OPS'));
insert into public.interview_sessions (id, company_id, assignment_id) values
  ('99999999-0000-4000-8000-000000000903', tests.company('ALPHA'), '99999999-0000-4000-8000-000000000902'),
  ('99999999-0000-4000-8000-000000000913', tests.company('ALPHA'), '99999999-0000-4000-8000-000000000912');
insert into public.discovered_processes (id, company_id, session_id, membership_id, process_key, name, purpose) values
  ('99999999-0000-4000-8000-000000000904', tests.company('ALPHA'), '99999999-0000-4000-8000-000000000903', tests.mid('a_ops_emp'), 'alloc', 'Case allocation', 'Assign cases'),
  ('99999999-0000-4000-8000-000000000914', tests.company('ALPHA'), '99999999-0000-4000-8000-000000000913', tests.mid('a_ops_head'), 'alloc', 'Case allocation to field staff', 'Assign cases'),
  ('99999999-0000-4000-8000-000000000915', tests.company('ALPHA'), '99999999-0000-4000-8000-000000000913', tests.mid('a_ops_head'), 'escal', 'Escalations', null);

-- employee: cannot link, cannot write directly
select tests.login('a_ops_emp'); set local role authenticated;
select throws_ok($$ select public.catalogue_link_source(tests.company('ALPHA'), (select id from public.catalogue_items where code = 'OPS-P01'),
                     '99999999-0000-4000-8000-000000000904') $$, '42501', null, 'an employee cannot link descriptions');
select throws_ok($$ insert into public.catalogue_item_sources (company_id, item_id, discovered_process_id, linked_by)
                     values (tests.company('ALPHA'), (select id from public.catalogue_items where code = 'OPS-P01'), '99999999-0000-4000-8000-000000000904', tests.mid('a_ops_emp')) $$,
                 '42501', null, 'sources are not writable directly');
reset role;

-- department head: suggestions, link two people's descriptions to ONE item
select tests.login('a_ops_head'); set local role authenticated;
select is((select item_code from public.catalogue_match_suggestions(tests.company('ALPHA')) where discovered_process_id = '99999999-0000-4000-8000-000000000914'),
          'OPS-P01', 'suggests the matching company process by name');
select lives_ok($$ select public.catalogue_link_source(tests.company('ALPHA'), (select id from public.catalogue_items where code = 'OPS-P01'),
                    '99999999-0000-4000-8000-000000000904', 'suggested') $$, 'owning department head links the first description');
select lives_ok($$ select public.catalogue_link_source(tests.company('ALPHA'), (select id from public.catalogue_items where code = 'OPS-P01'),
                    '99999999-0000-4000-8000-000000000914', 'suggested') $$, 'and a second person''s description of the same work');
select is((select count(*)::int from public.catalogue_item_sources where item_id = (select id from public.catalogue_items where code = 'OPS-P01')), 2,
          'one company item, two sources');
select is((select process_status from public.catalogue_items where code = 'OPS-P01'), 'performed', 'being described in interviews marks it as done today');
select is((select count(*)::int from public.catalogue_match_suggestions(tests.company('ALPHA'))
            where discovered_process_id in ('99999999-0000-4000-8000-000000000904', '99999999-0000-4000-8000-000000000914')), 0,
          'linked descriptions leave the unmatched list');
-- moving: one interview process belongs to one company item
select lives_ok($$ select public.catalogue_link_source(tests.company('ALPHA'), (select id from public.catalogue_items where code = 'OPS-P05'),
                    '99999999-0000-4000-8000-000000000914') $$, 'a description can be moved to another item');
select is((select count(*)::int from public.catalogue_item_sources where discovered_process_id = '99999999-0000-4000-8000-000000000914'), 1,
          'still exactly one link for that description');
select lives_ok($$ select public.catalogue_link_source(tests.company('ALPHA'), (select id from public.catalogue_items where code = 'OPS-P01'),
                    '99999999-0000-4000-8000-000000000914') $$, 'and moved back');
-- status form also records a source
select lives_ok($$ select public.catalogue_set_status(tests.company('ALPHA'), (select id from public.catalogue_items where code = 'OPS-P05'),
                    'performed', null, 'none', null, '99999999-0000-4000-8000-000000000915') $$, 'status form links a description');
select is((select c.code from public.catalogue_item_sources s join public.catalogue_items c on c.id = s.item_id
            where s.discovered_process_id = '99999999-0000-4000-8000-000000000915'), 'OPS-P05', 'and it is recorded as a source');
reset role;

-- employee sees the count, but only the source rows of conversations they may read
select tests.login('a_ops_emp'); set local role authenticated;
select is((select contributors from public.catalogue_source_counts(tests.company('ALPHA')) where item_id = (select id from public.catalogue_items where code = 'OPS-P01')),
          2, 'members see how many people described it');
select is((select count(*)::int from public.catalogue_item_sources), 1, 'but only the sources from conversations they can read');
select throws_ok($$ select public.catalogue_unlink_source(tests.company('ALPHA'), '99999999-0000-4000-8000-000000000904') $$,
                 '42501', null, 'an employee cannot unlink');
reset role;

-- one board case can carry all descriptions (up to 25)
select tests.login('a_admin'); set local role authenticated;
select throws_ok($$ select public.open_board_case(tests.company('ALPHA'), 'document_draft', 'sop', 'Too many', '',
                     array_fill('99999999-0000-4000-8000-000000000904'::uuid, array[26])) $$, 'P0001', null, 'at most 25 processes per case');
reset role;

select * from finish();
rollback;
