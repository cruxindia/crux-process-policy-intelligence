-- Document analysis (PPI-048): register the analysis prompt for every company (new companies copy it from the template on
-- provisioning). Idempotent. The hash must equal scripts/prompt-hash-documents.mts; doc-ai refuses to run on a mismatch.
insert into public.prompt_versions (company_id, prompt_key, version, purpose, template_sha256, output_schema, status)
select id, 'document.analysis', 1, 'Existing documents: as-is processes and flowcharts, checklist coverage, gaps, loose ends, risks with mitigations, questions',
       '1f57d3c6ce09fec793359ed0a10fb04d241daaa128c057a983ccc160ebb360af', '{"see":"supabase/functions/_shared/doc-analysis.ts DOC_SCHEMA"}'::jsonb, 'active'
  from public.companies
on conflict (company_id, prompt_key, version) do nothing;
