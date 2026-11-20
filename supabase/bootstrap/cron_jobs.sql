-- Hosted project only (pg_cron is not in the local test cluster). Idempotent.
-- Ticket reminders, escalation and the daily digest (PPI-037, D-093): working days at 09:30 India time (04:00 UTC).
create extension if not exists pg_cron;
select cron.unschedule(jobid) from cron.job where jobname = 'ppi-ticket-reminders';
select cron.schedule('ppi-ticket-reminders', '0 4 * * 1-5', $$select private.run_ticket_reminders()$$);
-- Monthly billing (PPI-038, D-094): 1st of each month, 06:30 India time (01:00 UTC), drafts last month's invoices.
-- Drafts only unless the owner turns on auto_issue in Billing → Settings.
select cron.unschedule(jobid) from cron.job where jobname = 'ppi-monthly-billing';
select cron.schedule('ppi-monthly-billing', '0 1 1 * *', $$select private.run_monthly_billing()$$);
