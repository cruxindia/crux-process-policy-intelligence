-- PPI-037: tasks & tickets — create, see, comment, status, assign, reminders, escalation, digest, platform support.
begin;
select plan(31);

insert into auth.users (id, email) values (tests.uid('platform_owner'), 'platform_owner@example.invalid');
insert into private.platform_admins (user_id) values (tests.uid('platform_owner'));

select is(private.add_working_days('2026-11-20 10:00+05:30', 1), '2026-11-23 18:00+05:30'::timestamptz, 'Friday + 1 working day = Monday end of day');

-- employee raises a peer task in their own department and a question to another department
select tests.login('a_ops_emp'); set local role authenticated;
create temp table ids (k text primary key, id uuid) on commit drop;
grant all on ids to authenticated;
insert into ids select 'peer', public.ticket_create(tests.company('ALPHA'), 'action', 'Update the pincode sheet', 'Two new pincodes', 'high', tests.mid('a_proc_owner'));
select ok((select id from ids where k = 'peer') is not null, 'an employee can give a task to a colleague in the same department');
select throws_ok($$ select public.ticket_create(tests.company('ALPHA'), 'action', 'Pay this vendor', null, 'normal', tests.mid('a_fin_head')) $$,
                 '42501', null, 'but not directly to a person in another department');
insert into ids select 'dept', public.ticket_create(tests.company('ALPHA'), 'question', 'Which payments need two signatures?', null, 'normal', null, tests.dept('ALPHA', 'FIN'));
select ok((select id from ids where k = 'dept') is not null, '…they address that department instead');
select throws_ok($$ select public.ticket_create(tests.company('ALPHA'), 'action', 'x', null, 'normal') $$, 'P0001', null, 'a task needs a person or department (and a real title)');
select throws_ok($$ select public.ticket_create(tests.company('ALPHA'), 'billing_dispute', 'Invoice too high') $$, '42501', null, 'only administrators dispute invoices');
insert into ids select 'support', public.ticket_create(tests.company('ALPHA'), 'support', 'The interview page is slow on my phone', 'Takes 20 seconds', 'normal');
select is((select to_platform from public.tickets where id = (select id from ids where k = 'support')), true, 'support tickets go to the platform team');
select is((select code ~ '^TKT-\d+$' from public.tickets where id = (select id from ids where k = 'peer')), true, 'every ticket gets a ticket number');
select ok((select due_at from public.tickets where id = (select id from ids where k = 'peer')) > now(), 'a due date is set from the priority');
select throws_ok($$ insert into public.tickets (company_id, kind, title) values (tests.company('ALPHA'), 'action', 'direct') $$, '42501', null, 'tickets are created only through the function');
reset role;

select is((select count(*)::int from public.notifications where object_type = 'ticket' and recipient_membership_id = tests.mid('a_proc_owner')), 1, 'the assignee is notified');

-- visibility
select tests.login('a_fin_head'); set local role authenticated;
select is((select count(*)::int from public.tickets where company_id = tests.company('ALPHA')), 1, 'FIN head sees only the ticket addressed to FIN');
select lives_ok($$ select public.ticket_comment(tests.company('ALPHA'), (select id from ids where k = 'dept'), 'Above 5 lakh, two signatures') $$, 'the department answers in the thread');
select lives_ok($$ select public.ticket_set_status(tests.company('ALPHA'), (select id from ids where k = 'dept'), 'resolved', 'Answered in thread') $$, 'and resolves it (department manager)');
select throws_ok($$ select public.ticket_set_status(tests.company('ALPHA'), (select id from ids where k = 'peer'), 'resolved', 'x') $$, '42501', null, 'not other departments'' tickets');
reset role;
select is((select count(*)::int from public.notifications where object_type = 'ticket' and recipient_membership_id = tests.mid('a_ops_emp')), 2,
          'the requester hears about the reply and the resolution');

select tests.login('a_proc_owner'); set local role authenticated;
select throws_ok($$ select public.ticket_set_status(tests.company('ALPHA'), (select id from ids where k = 'peer'), 'resolved') $$, 'P0001', null, 'resolving needs a resolution');
select lives_ok($$ select public.ticket_set_status(tests.company('ALPHA'), (select id from ids where k = 'peer'), 'in_progress') $$, 'the assignee starts work');
select throws_ok($$ select public.ticket_set_status(tests.company('ALPHA'), (select id from ids where k = 'peer'), 'cancelled') $$, '42501', null, 'only the requester or a manager cancels');
select throws_ok($$ select public.ticket_assign(tests.company('ALPHA'), (select id from ids where k = 'peer'), tests.mid('a_ops_emp')) $$, '42501', null, 'only managers re-assign');
select throws_ok($$ update public.ticket_comments set body = 'changed' $$, '42501', null, 'the thread cannot be edited');
reset role;

select tests.login('a_ops_head'); set local role authenticated;
select is((select count(*)::int from public.tickets where company_id = tests.company('ALPHA') and assignee_department_id = tests.dept('ALPHA','OPS')), 1, 'the OPS head sees OPS tickets');
select lives_ok($$ select public.ticket_assign(tests.company('ALPHA'), (select id from ids where k = 'peer'), tests.mid('a_ops_emp'), timestamptz '2026-11-19 18:00+05:30') $$, 'and re-assigns (here with a past due date)');
reset role;

-- support ticket: the platform owner sees and answers it; other companies never see it
select tests.login('b_admin'); set local role authenticated;
select is((select count(*)::int from public.tickets where company_id = tests.company('ALPHA')), 0, 'another company sees nothing');
reset role;
select tests.login('platform_owner'); set local role authenticated;
select is((select count(*)::int from public.platform_tickets()), 1, 'the platform owner sees the open support ticket');
select lives_ok($$ select public.ticket_comment((select company_id from public.platform_tickets(false) limit 1), (select id from ids where k = 'support'), 'Fixed: images now load lazily') $$, 'replies');
select lives_ok($$ select public.ticket_set_status((select company_id from public.platform_tickets(false) limit 1), (select id from ids where k = 'support'), 'resolved', 'Performance fix released') $$, 'and resolves');
select is((select count(*)::int from public.tickets where kind = 'action'), 0, 'but cannot read the company''s internal tasks');
reset role;

-- daily run: reminder, escalation of the overdue ticket to the OPS head, one digest per person
update public.tickets set created_at = timestamptz '2026-11-17 10:00+05:30' where id = (select id from ids where k = 'peer');
select is((private.run_ticket_reminders('2026-11-23 09:30+05:30') ->> 'escalated')::int, 1, 'the overdue ticket is escalated');
select is((select escalated_to_membership_id from public.tickets where id = (select id from ids where k = 'peer')), tests.mid('a_ops_head'),
          'to the head of the assignee''s department, with a reminder number');
select is((select count(*)::int from public.notifications where kind = 'digest' and recipient_membership_id = tests.mid('a_ops_emp')), 1, 'one digest for the assignee')
;

select * from finish();
rollback;
