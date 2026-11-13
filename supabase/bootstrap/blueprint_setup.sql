-- Company Operating Blueprint (PPI-032): register the synthesis prompt for CRUX and E2E-SYNTH. Idempotent.
-- The hash must equal scripts/prompt-hash-blueprint.mts (checked in CI); blueprint-ai refuses to run on a mismatch.
do $setup$
declare v_co uuid;
begin
  for v_co in select id from public.companies where code in ('CRUX', 'E2E-SYNTH') loop
    insert into public.prompt_versions (company_id, prompt_key, version, purpose, template_sha256, output_schema, status)
    values (v_co, 'blueprint.synthesis', 2, 'Company Operating Blueprint: propose cited entries per area and voice, CTQs without targets, open questions for leadership',
            'c38476ef3327cd350ee5ebad64df2b8e39617d0ce5a9f27c3a6d7336f7bfe993', '{"see":"supabase/functions/_shared/blueprint.ts BLUEPRINT_SCHEMA"}'::jsonb, 'active')
    on conflict (company_id, prompt_key, version) do nothing;
    update public.prompt_versions set status = 'retired' where company_id = v_co and prompt_key = 'blueprint.synthesis' and version < 2 and status = 'active';
  end loop;
end $setup$;
