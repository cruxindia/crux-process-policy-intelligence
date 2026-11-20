-- Run after e2e/billing.cjs (hosted, as owner): removes the synthetic tenants' packages and invoices so the real invoice
-- series starts at 0001, closes synthetic dispute tickets, and revokes the temporary platform-owner grant.
delete from public.invoices where company_id in (select id from public.companies where code like 'E2E%');
delete from public.company_subscriptions where company_id in (select id from public.companies where code like 'E2E%');
update public.tickets set status = 'closed', resolution = 'Synthetic E2E data', resolved_at = now()
 where kind = 'billing_dispute' and company_id in (select id from public.companies where code like 'E2E%') and status not in ('resolved', 'closed');
update public.companies set status = 'archived', status_note = 'Synthetic E2E company' where code like 'E2E-NC-%' and status <> 'archived';
delete from private.platform_admins where user_id = 'e2e00000-0000-4000-8000-00000000000a';
