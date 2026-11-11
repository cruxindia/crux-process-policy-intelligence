-- PPI-011 Minimal MVP dashboard view (FR-16 / MVP step 13) and privilege hardening (NFR-01).
-- Metric definitions: docs/DASHBOARD_METRICS.md. The view is security_invoker, so every count respects RLS.

create view public.dashboard_process_status with (security_invoker = true) as
select p.company_id,
       p.id                         as process_id,
       p.code                       as process_code,
       p.name                       as process_name,
       p.owner_department_id,
       p.status                     as process_status,
       lv.version_no                as latest_version_no,
       lv.state_kind                as latest_version_kind,
       lv.status                    as latest_version_status,
       (select count(*) from public.knowledge_records k where k.company_id = p.company_id and k.process_id = p.id
           and k.lifecycle_status in ('draft','submitted','under_review'))                       as knowledge_pending_review,
       (select count(*) from public.knowledge_records k where k.company_id = p.company_id and k.process_id = p.id
           and k.lifecycle_status in ('verified','approved'))                                     as knowledge_verified,
       (select count(*) from public.knowledge_records k where k.company_id = p.company_id and k.process_id = p.id
           and k.claim_origin in ('ai_inference','unverified_hypothesis')
           and k.lifecycle_status not in ('rejected','superseded','retired'))                     as open_hypotheses,
       (select count(*) from public.clarification_tasks c where c.company_id = p.company_id and c.process_id = p.id
           and c.status not in ('resolved','cancelled'))                                          as open_clarifications,
       (select count(*) from public.clarification_tasks c where c.company_id = p.company_id and c.process_id = p.id
           and c.status not in ('resolved','cancelled') and c.due_at < now())                     as overdue_clarifications,
       (select count(*) from public.disputes d where d.company_id = p.company_id and d.process_id = p.id
           and d.status not in ('decided','withdrawn'))                                           as open_disputes,
       (select count(*) from public.document_versions v join public.documents doc
           on doc.company_id = v.company_id and doc.id = v.document_id
         where doc.company_id = p.company_id and doc.process_id = p.id and v.status = 'in_review') as documents_in_approval,
       (select count(*) from public.document_versions v join public.documents doc
           on doc.company_id = v.company_id and doc.id = v.document_id
         where doc.company_id = p.company_id and doc.process_id = p.id and v.status = 'published') as documents_published
  from public.processes p
  left join lateral (
    select v.version_no, v.state_kind, v.status from public.process_versions v
     where v.company_id = p.company_id and v.process_id = p.id
     order by v.version_no desc limit 1) lv on true;

-- ---------------------------------------------------------------------------
-- Privileges. Supabase grants API roles broad table rights by default; RLS decides rows.
-- Remove what is never needed so a missing policy cannot become a hole.
-- ---------------------------------------------------------------------------
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke execute on all functions in schema public from anon, public;
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on sequences from anon;
alter default privileges in schema public revoke execute on functions from anon, public;

revoke truncate, references, trigger on all tables in schema public from authenticated;
revoke delete on all tables in schema public from authenticated;
-- deletes only where the data is a draft working set (guards still block non-draft parents)
grant delete on public.interview_answer_drafts, public.knowledge_sources, public.process_steps,
                public.process_edges, public.process_step_sources, public.document_version_sources to authenticated;

-- system-owned tables: no direct writes from end users
revoke insert, update on public.audit_events, public.permissions, public.background_jobs,
                        public.ai_provider_policies, public.prompt_versions from authenticated;
revoke select on public.background_jobs from authenticated;
grant execute on function public.process_map_issues(uuid) to authenticated;
