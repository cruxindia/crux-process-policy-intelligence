-- PPI-038: billing — packages, calculation with GST, invoices, visibility, immutability, disputes.
begin;
select plan(26);

insert into auth.users (id, email) values (tests.uid('platform_owner'), 'platform_owner@example.invalid');
insert into private.platform_admins (user_id) values (tests.uid('platform_owner'));

select is((select count(*)::int from public.billing_plans where is_draft_price), 3, 'three example packages, marked as draft prices');

-- the calculation (GROWTH: 45,000 base, 100 people, 350 per extra person, 10,000 AI runs, 200 per extra 100 runs)
select is((private.invoice_calc((select p from public.billing_plans p where code = 'GROWTH'), '{"active_people":120,"ai_runs":10250}', 10, '27', '27', 18)
          - 'lines')::text,
          '{"cgst": 4260.60, "igst": 0, "sgst": 4260.60, "total": 55861.20, "taxable": 47340.00, "discount": 5260.00, "subtotal": 52600.00}',
          'base + 20 extra people + 3 AI packs − 10% discount; same state → CGST + SGST');
select is((private.invoice_calc((select p from public.billing_plans p where code = 'GROWTH'), '{"active_people":120,"ai_runs":10250}', 10, '27', '29', 18) ->> 'igst')::numeric,
          8521.20, 'another state → IGST');
select is(jsonb_array_length(private.invoice_calc((select p from public.billing_plans p where code = 'GROWTH'), '{"active_people":40,"ai_runs":10}', 0, '27', '27', 18) -> 'lines'),
          1, 'within the package: only the monthly fee');

select tests.login('a_admin'); set local role authenticated;
select is((select count(*)::int from public.billing_plans), 3, 'company admins see the standard packages');
select throws_ok($$ select public.platform_subscribe(tests.company('ALPHA'), (select id from public.billing_plans where code = 'GROWTH')) $$, '42501', null, 'only the platform owner sets packages');
select lives_ok($$ select public.company_save_billing_profile(tests.company('ALPHA'), 'Alpha Synthetic Pvt Ltd', '27AAAAA0000A1Z5', 'Pune', '27', 'billing@example.invalid') $$,
                'the company admin fills the company''s billing details');
select throws_ok($$ select public.company_save_billing_profile(tests.company('ALPHA'), 'x', 'NOT-A-GSTIN', null, null, null) $$, '23514', null, 'GSTIN format is checked');
reset role;
select tests.login('a_ops_emp'); set local role authenticated;
select throws_ok($$ select public.company_billing_estimate(tests.company('ALPHA')) $$, '42501', null, 'employees do not see billing');
reset role;

select tests.login('platform_owner'); set local role authenticated;
select throws_ok($$ select public.platform_save_billing_settings('{"billing_gstin":"123"}') $$, 'P0001', null, 'the platform GSTIN is checked');
select lives_ok($$ select public.platform_save_billing_settings('{"billing_legal_name":"Platform Owner Synthetic","billing_gstin":"27BBBBB1111B1Z5","billing_address":"Pune","billing_state_code":"27","sac_code":"998314"}') $$,
                'the owner fills the billing profile');
select lives_ok($$ select public.platform_subscribe((select company_id from public.platform_companies() where code = 'ALPHA'), (select id from public.billing_plans where code = 'GROWTH'), 10, '2026-10-01') $$,
                'the owner puts ALPHA on Growth with 10% discount');
select lives_ok($$ select public.platform_save_plan(null, 'BETA-CUSTOM', 'Beta custom', null, 9000, 10, 500, 500, 300, array['custom'], (select company_id from public.platform_companies() where code = 'BETA')) $$,
                'a custom package for one company');
select throws_ok($$ select public.platform_subscribe((select company_id from public.platform_companies() where code = 'ALPHA'), (select id from public.billing_plans where code = 'BETA-CUSTOM')) $$,
                 'P0001', null, 'a custom package cannot be used by another company');
select is((public.platform_generate_invoices('2026-10-15') ->> 'invoices')::int, 1, 'monthly run drafts one invoice (only ALPHA has a package)');
select is((public.platform_generate_invoices('2026-10-15') ->> 'invoices')::int, 1, 'running again does not duplicate it');
select is((select proforma from public.invoices limit 1), false, 'complete billing profile → a tax invoice, not proforma');
select is((select (usage ->> 'days_billed')::int from public.invoices limit 1), 31, 'package from 1 October → all 31 days billed');
reset role;

select tests.login('a_admin'); set local role authenticated;
select is((select count(*)::int from public.invoices), 0, 'drafts are not visible to the company');
reset role;
select tests.login('platform_owner'); set local role authenticated;
select matches(public.platform_invoice_action((select id from public.invoices limit 1), 'issue'), '^PPI/\d\d-\d\d/0001$', 'issuing assigns the FY invoice number');
reset role;
select is((select count(*)::int from public.notifications where kind = 'invoice' and recipient_membership_id = tests.mid('a_admin')), 1, 'the company admin is notified');
select throws_ok($$ update public.invoices set total = 1 $$, 'P0001', null, 'an issued invoice cannot be changed');

select tests.login('a_admin'); set local role authenticated;
select is((select count(*)::int from public.invoices), 1, 'the issued invoice is visible to the company admin');
select lives_ok($$ select public.company_dispute_invoice(tests.company('ALPHA'), (select id from public.invoices limit 1), 'We had only 80 active people in October') $$,
                'the company admin disputes it (becomes a billing ticket)');
reset role;
select is((select count(*)::int from public.tickets t join public.invoices i on i.id = t.related_id where t.kind = 'billing_dispute' and t.to_platform and i.disputed), 1,
          'dispute ticket goes to the platform, invoice flagged');

-- pro-rata (PPI-039): BETA starts 22 October → 10 of 31 days of the 9,000 fee
insert into public.company_subscriptions (company_id, plan_id, starts_on) values (tests.company('BETA'), (select id from public.billing_plans where code = 'BETA-CUSTOM'), '2026-10-22');
select private.build_invoice(tests.company('BETA'), '2026-10-01') is not null as built;
select is((select jsonb_build_object('fee', (lines -> 0 ->> 'amount')::numeric, 'days', usage -> 'days_billed', 'label', lines -> 0 ->> 'label')
             from public.invoices where company_id = tests.company('BETA')),
          '{"fee": 2903.23, "days": 10, "label": "Beta custom (10 of 31 days) package — monthly fee"}'::jsonb, 'a company starting mid-month pays the base fee pro rata');

select * from finish();
rollback;
