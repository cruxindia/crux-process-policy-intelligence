-- PPI-013 Supabase advisor fix (multiple_permissive_policies): the `for all` write policies on
-- process_steps / process_edges / process_step_sources also applied to SELECT, duplicating the read policy.
-- Split them into insert / update / delete so SELECT is governed by the read policy alone. Behaviour unchanged.

drop policy ps_write on public.process_steps;
create policy ps_insert on public.process_steps for insert to authenticated
  with check ((select private.has_permission(company_id, 'process.edit', null, private.version_process(company_id, process_version_id))));
create policy ps_update on public.process_steps for update to authenticated
  using ((select private.has_permission(company_id, 'process.edit', null, private.version_process(company_id, process_version_id))))
  with check ((select private.has_permission(company_id, 'process.edit', null, private.version_process(company_id, process_version_id))));
create policy ps_delete on public.process_steps for delete to authenticated
  using ((select private.has_permission(company_id, 'process.edit', null, private.version_process(company_id, process_version_id))));

drop policy pe_write on public.process_edges;
create policy pe_insert on public.process_edges for insert to authenticated
  with check ((select private.has_permission(company_id, 'process.edit', null, private.version_process(company_id, process_version_id))));
create policy pe_update on public.process_edges for update to authenticated
  using ((select private.has_permission(company_id, 'process.edit', null, private.version_process(company_id, process_version_id))))
  with check ((select private.has_permission(company_id, 'process.edit', null, private.version_process(company_id, process_version_id))));
create policy pe_delete on public.process_edges for delete to authenticated
  using ((select private.has_permission(company_id, 'process.edit', null, private.version_process(company_id, process_version_id))));

drop policy pss_write on public.process_step_sources;
create policy pss_insert on public.process_step_sources for insert to authenticated
  with check ((select private.has_permission(company_id, 'process.edit', null,
                 private.version_process(company_id, private.step_version(company_id, process_step_id))))
              and (select private.can_read_knowledge(company_id, knowledge_record_id)));
create policy pss_update on public.process_step_sources for update to authenticated
  using ((select private.has_permission(company_id, 'process.edit', null,
            private.version_process(company_id, private.step_version(company_id, process_step_id)))))
  with check ((select private.has_permission(company_id, 'process.edit', null,
                 private.version_process(company_id, private.step_version(company_id, process_step_id))))
              and (select private.can_read_knowledge(company_id, knowledge_record_id)));
create policy pss_delete on public.process_step_sources for delete to authenticated
  using ((select private.has_permission(company_id, 'process.edit', null,
            private.version_process(company_id, private.step_version(company_id, process_step_id)))));
