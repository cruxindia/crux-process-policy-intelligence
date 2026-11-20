-- Hosted project only (pg_cron is not in the local test cluster). Idempotent.
-- Ticket reminders, escalation and the daily digest (PPI-037, D-093): working days at 09:30 India time (04:00 UTC).
create extension if not exists pg_cron;
select cron.unschedule(jobid) from cron.job where jobname = 'ppi-ticket-reminders';
select cron.schedule('ppi-ticket-reminders', '0 4 * * 1-5', $$select private.run_ticket_reminders()$$);
