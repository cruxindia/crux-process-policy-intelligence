-- Sprint 04 (S-08): adaptive AI interview — prompt provenance, provider policy, adaptive campaigns. Idempotent.
-- template_sha256 must equal sha256(SYSTEM_PROMPT + JSON.stringify(TURN_SCHEMA)) from supabase/functions/_shared/engine.ts
-- (print it with: node --experimental-strip-types scripts/prompt-hash.mts). The Edge Function refuses to run if they differ.
--
-- Provider policy (D-011 / D-039):
--   * gemini_paid  = Gemini API on a PAID (Cloud Billing) project: Google does not use prompts to improve products.
--                    max_classification internal, may_train false.
--   * gemini_free  = Gemini API free tier: Google may use prompts to improve products → public data only.
--   CRUX: gemini_paid is created DISABLED until the CRUX key's billing tier is confirmed (see adaptive_ai_activate_crux.sql).
--   E2E-SYNTH (synthetic test tenant, no real data): gemini_paid active.
\set ON_ERROR_STOP on
do $$
declare
  v_hash constant text := '5d69f83d628475a8ad7a46e273678ccfb07cd9672d0440040eb87ec204a75ced';
  r record; v_co uuid; v_dept uuid; v_owner uuid; v_camp uuid;
begin
  for r in select * from (values
      ('E2E-SYNTH', 'E2E-ADAPT-01', 'Synthetic adaptive discovery (test)', 'active',  'active',   8, 'E2E-JOIN-01'),
      ('CRUX',      'CRUX-DISC-02', 'CRUX process discovery — AI interview', 'draft', 'disabled', 25, 'CRUX-DISC-01')
    ) t(co_code, camp_code, camp_name, camp_status, policy_status, max_q, base_camp)
  loop
    select id into v_co from public.companies where code = r.co_code;
    continue when v_co is null;
    select department_id, owner_membership_id into v_dept, v_owner from public.interview_campaigns where company_id = v_co and code = r.base_camp;

    insert into public.prompt_versions (company_id, prompt_key, version, purpose, template_sha256, output_schema, status)
    values (v_co, 'interview.adaptive', 1, 'Adaptive one-question-at-a-time discovery interview: analyse latest answer, update coverage, detect contradictions, choose next question',
            v_hash, '{"see":"supabase/functions/_shared/engine.ts TURN_SCHEMA"}'::jsonb, 'active')
    on conflict (company_id, prompt_key, version) do nothing;

    insert into public.ai_provider_policies (company_id, provider, max_classification, may_train_on_inputs, terms_checked_on, status, notes)
    values (v_co, 'gemini_paid', 'internal', false, date '2026-11-11', r.policy_status,
            'Gemini API on a paid Cloud Billing project (Google: paid-tier prompts not used to improve products). Stateless generateContent; no Interactions API storage.'),
           (v_co, 'gemini_free', 'public', true, date '2026-11-11', 'active',
            'Gemini API free tier: Google may use content to improve products → public data only (blocks interview data by design).')
    on conflict (company_id, provider) do nothing;

    insert into public.interview_campaigns (company_id, code, name, purpose, department_id, owner_membership_id, status,
                                            question_scopes, interview_mode, ai_provider, max_ai_questions)
    values (v_co, r.camp_code, r.camp_name,
            'We are writing down how work really happens today, so we can build accurate SOPs and fix what slows us down. After a few questions about you and the company, an AI interviewer asks one question at a time about your work, building on your answers. “I don''t know” is a fine answer. Nothing you write becomes company policy without human review.',
            v_dept, v_owner, r.camp_status, array['general','company_dna'], 'adaptive', 'gemini_paid', r.max_q)
    on conflict (company_id, code) do nothing;
  end loop;
end $$;

-- Synthetic tenant: a separate join link for the adaptive campaign (the fixed-flow E2E link is left unchanged).
do $$
declare v_co uuid; v_camp uuid; v_dept uuid; v_owner uuid;
begin
  select c.id, k.id, k.department_id, k.owner_membership_id into v_co, v_camp, v_dept, v_owner
    from public.companies c join public.interview_campaigns k on k.company_id = c.id and k.code = 'E2E-ADAPT-01' where c.code = 'E2E-SYNTH';
  if v_co is null or exists (select 1 from public.company_join_links where company_id = v_co and campaign_id = v_camp) then return; end if;
  perform set_config('ppi.adapt_token', translate(encode(extensions.gen_random_bytes(18), 'base64'), '+/=', '-_'), false);
  insert into public.company_join_links (company_id, label, token_sha256, campaign_id, department_id, created_by_membership_id)
  values (v_co, 'Adaptive AI test link', encode(extensions.digest(current_setting('ppi.adapt_token'), 'sha256'), 'hex'), v_camp, v_dept, v_owner);
end $$;
select current_setting('ppi.adapt_token', true) as e2e_adaptive_join_token;
