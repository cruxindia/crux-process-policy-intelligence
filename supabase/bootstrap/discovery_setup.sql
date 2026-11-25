-- S-10 (Master Corrective Prompt v2.0): AI-led discovery conversation. Idempotent.
-- template_sha256 = sha256(SYSTEM_PROMPT_V2 + JSON.stringify(TURN_SCHEMA_V2)); print with:
--   node --experimental-strip-types scripts/prompt-hash-v2.mts
do $$
declare r record; v_co uuid; v_dept uuid; v_owner uuid;
begin
  for r in select * from (values
      ('E2E-SYNTH', 'E2E-DISCOVERY', 'Synthetic AI discovery conversation (test)', 'active', 30, 'E2E-ADAPT-01'),
      ('CRUX',      'CRUX-DISCOVERY', 'CRUX — Let''s understand the work you do',   'draft',  80, 'CRUX-DISC-02')
    ) t(co_code, camp_code, camp_name, camp_status, max_q, base_camp)
  loop
    select id into v_co from public.companies where code = r.co_code;
    continue when v_co is null;
    select department_id, owner_membership_id into v_dept, v_owner from public.interview_campaigns where company_id = v_co and code = r.base_camp;
    insert into public.prompt_versions (company_id, prompt_key, version, purpose, template_sha256, output_schema, status)
    values (v_co, 'interview.discovery', 5,
            'AI-led discovery with live flowchart (v5: v4 + interviews start from what the company''s documents say and the open points found in them)',
            '4c6c2960f1cd820af40aaa5ba2597c1b2e051e1e69a03940c3ef580938e2a574',
            '{"see":"supabase/functions/_shared/discovery.ts TURN_SCHEMA_V2"}'::jsonb, 'active')
    on conflict (company_id, prompt_key, version) do nothing;
    -- History (kept for audit, retired): v1 391374917666… rejected by Gemini (HTTP 400 on the response schema, 12-Nov-2026);
    -- v2 d2d79aff412b… worked but only built the inventory after confirmation (live UI test, 12-Nov-2026);
    -- v3 bab7cd428855… 10 dimensions, no suggested answers (replaced by v4 on 14-Nov-2026, M3);
    -- v4 a88831c66671… 20 dimensions + suggested answers (replaced by v5 on 25-Nov-2026, document-first interviews).
    update public.prompt_versions set status = 'retired' where company_id = v_co and prompt_key = 'interview.discovery' and version < 5 and status = 'active';
    insert into public.interview_campaigns (company_id, code, name, purpose, department_id, owner_membership_id, status,
                                            question_scopes, interview_mode, ai_provider, max_ai_questions)
    values (v_co, r.camp_code, r.camp_name,
            'I will guide you through a conversation to understand your role, responsibilities, activities and the processes you manage. You do not need to prepare documents or know how to describe a formal process. Just explain your work naturally, and I will organise the information for you.',
            v_dept, v_owner, r.camp_status, '{}', 'discovery', null, r.max_q)
    on conflict (company_id, code) do nothing;
  end loop;
end $$;

-- v5 for every other company that already runs discovery (e.g. DEMO): same prompt, previous versions retired.
insert into public.prompt_versions (company_id, prompt_key, version, purpose, template_sha256, output_schema, status)
select distinct company_id, 'interview.discovery', 5,
       'AI-led discovery with live flowchart (v5: v4 + interviews start from what the company''s documents say and the open points found in them)',
       '4c6c2960f1cd820af40aaa5ba2597c1b2e051e1e69a03940c3ef580938e2a574', '{"see":"supabase/functions/_shared/discovery.ts TURN_SCHEMA_V2"}'::jsonb, 'active'
  from public.prompt_versions where prompt_key = 'interview.discovery'
on conflict (company_id, prompt_key, version) do nothing;
update public.prompt_versions set status = 'retired' where prompt_key = 'interview.discovery' and version < 5 and status = 'active';
