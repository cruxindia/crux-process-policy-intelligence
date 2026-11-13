-- PPI-030: blueprint catalogue — baseline seed, read for members, writes via RPC only, classification maker-checker, gap view.
begin;
select plan(24);

select is(private.seed_blueprint_catalogue(tests.company('ALPHA')), 148, 'blueprint baseline: 93 core processes + 23 policies + 32 SOPs');
select is(private.seed_blueprint_catalogue(tests.company('ALPHA')), 0, 'seeding again adds nothing (idempotent)');
select is((select count(*)::int from public.catalogue_functions where company_id = tests.company('ALPHA')), 16, '16 functions');
select is((select count(*)::int from public.catalogue_items where company_id = tests.company('ALPHA') and classification <> 'unassessed'), 0,
          'nothing is pre-classified — the baseline is not a statement that anything is mandatory');

-- employee: reads, cannot write
select tests.login('a_ops_emp'); set local role authenticated;
select is((select count(*)::int from public.catalogue_items), 148, 'members can read the catalogue');
select is((select count(*)::int from public.catalogue_gaps where gap_type = 'needs_assessment'), 148, 'gap view: everything needs assessment at first');
select throws_ok($$ update public.catalogue_items set classification = 'mandatory' $$, '42501', null, 'catalogue tables are not writable directly');
select throws_ok($$ select public.catalogue_request_classification(tests.company('ALPHA'),
                     (select id from public.catalogue_items where code = 'POL-07'), 'required', null, null, 'Needed to run the company') $$,
                 '42501', null, 'an employee cannot classify');
reset role;

-- admin: classification rules
select tests.login('a_admin'); set local role authenticated;
select throws_ok($$ select public.catalogue_request_classification(tests.company('ALPHA'),
                     (select id from public.catalogue_items where code = 'POL-07'), 'required', null, null, 'short') $$,
                 'P0001', null, 'a reason of at least 10 characters is required');
select throws_ok($$ select public.catalogue_request_classification(tests.company('ALPHA'),
                     (select id from public.catalogue_items where code = 'POL-11'), 'mandatory', 'improvement', null, 'Women employees at several branches') $$,
                 'P0001', null, 'mandatory needs a legal/regulatory/contractual/company-decision basis and a reference');
select is(public.catalogue_request_classification(tests.company('ALPHA'), (select id from public.catalogue_items where code = 'POL-07'),
          'required', null, null, 'Every employee needs one place for the rules'), 'applied', 'required applies at once (not in approval_required)');
select is((select gap_type from public.catalogue_gaps where code = 'POL-07'), 'unknown', 'classified but process status unknown');
select is(public.catalogue_request_classification(tests.company('ALPHA'), (select id from public.catalogue_items where code = 'POL-11'),
          'mandatory', 'law', 'Sexual Harassment of Women at Workplace Act, 2013 [section to be confirmed]', 'Company employs women at branches'),
          'pending', 'mandatory waits for approval');
select is((select classification from public.catalogue_items where code = 'POL-11'), 'unassessed', 'nothing changes until approved');
select throws_ok($$ select public.catalogue_request_classification(tests.company('ALPHA'), (select id from public.catalogue_items where code = 'POL-11'),
                     'not_applicable', null, null, 'Changed my mind about this one') $$, 'P0001', null, 'only one pending change per item');
select throws_ok($$ select public.catalogue_decide_classification(tests.company('ALPHA'),
                     (select id from public.catalogue_classification_requests where status = 'pending'), 'approved') $$,
                 '42501', null, 'nobody approves their own request');
reset role;

select tests.login('a_approver'); set local role authenticated;
select throws_ok($$ select public.catalogue_decide_classification(tests.company('ALPHA'),
                     (select id from public.catalogue_classification_requests where status = 'pending'), 'rejected', '') $$,
                 'P0001', null, 'a rejection needs a reason');
select lives_ok($$ select public.catalogue_decide_classification(tests.company('ALPHA'),
                    (select id from public.catalogue_classification_requests where status = 'pending'), 'approved', 'Agreed') $$, 'a second person approves');
select is((select classification || '/' || basis from public.catalogue_items where code = 'POL-11'), 'mandatory/law', 'approved classification applied with its basis');
reset role;

-- department head of the owning department updates process/document status; gap types follow
update public.catalogue_functions set department_id = tests.dept('ALPHA', 'OPS') where company_id = tests.company('ALPHA') and code = 'OPS';
select tests.login('a_ops_head'); set local role authenticated;
select lives_ok($$ select public.catalogue_set_status(tests.company('ALPHA'), (select id from public.catalogue_items where code = 'OPS-P01'),
                    'performed', 'Done every morning', 'none', null) $$, 'owning department head updates status');
select throws_ok($$ select public.catalogue_set_status(tests.company('ALPHA'), (select id from public.catalogue_items where code = 'FIN-P01'),
                     'performed', null, 'none', null) $$, '42501', null, 'but not for another department''s function');
reset role;
select tests.login('a_admin'); set local role authenticated;
select public.catalogue_request_classification(tests.company('ALPHA'), (select id from public.catalogue_items where code = 'OPS-P01'),
       'required', null, null, 'Core to case delivery for every client');
select is((select gap_type from public.catalogue_gaps where code = 'OPS-P01'), 'documentation_gap', 'performed but undocumented = documentation gap, not a process gap');
select public.catalogue_set_status(tests.company('ALPHA'), (select id from public.catalogue_items where code = 'POL-11'), 'not_performed', 'No committee yet', 'none', null);
select is((select gap_type from public.catalogue_gaps where code = 'POL-11'), 'process_gap', 'mandatory and not performed = process gap');
reset role;

-- company isolation
select tests.login('b_admin'); set local role authenticated;
select is((select count(*)::int from public.catalogue_items), 0, 'another company sees nothing');
reset role;

select * from finish();
rollback;
