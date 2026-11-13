-- Synthetic E2E tenant only (E2E-SYNTH): the discovery lead plays the department head in M3 tests, so it may validate
-- company processes (process.validate, D-088). Never applied to a real company. Idempotent.
insert into public.role_permissions (company_id, role_id, permission_code)
select r.company_id, r.id, 'process.validate' from public.roles r join public.companies c on c.id = r.company_id
 where c.code = 'E2E-SYNTH' and r.code = 'DISCOVERY_LEAD'
on conflict do nothing;
