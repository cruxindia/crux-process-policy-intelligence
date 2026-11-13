-- D-065/D-066 (13-Nov-2026): owner decisions for the expert board, recorded with who/when/why. Idempotent.
-- 1) Gemini free tier may now receive CONFIDENTIAL data for CRUX: Shantanu (AVP Operations & Growth) answered
--    "Accept the risk, send everything" on 13-Nov-2026 after being told Google may use free-tier inputs and humans may read them.
--    RESTRICTED (customer KYC / personal data of third parties) stays impossible — enforced by ai_provider_policies_training_check;
--    the owner cannot consent on behalf of customers (DPDP Act 2023).
update public.ai_provider_policies p
   set max_classification = 'confidential',
       training_accepted_by_membership_id = case c.code when 'CRUX' then '362ad986-3017-4bd6-b4e4-1218139bc39d'::uuid else p.training_accepted_by_membership_id end,
       training_accepted_on = date '2026-11-13',
       training_acceptance_note = case c.code
         when 'CRUX' then 'Owner (Shantanu, AVP Operations & Growth) on 13-Nov-2026: "Accept the risk, send everything" — Gemini free tier may receive internal and confidential company data (Google may use it to improve products; humans may review it). Restricted customer data stays blocked.'
         else 'Synthetic test tenant; mirrors the CRUX decision of 13-Nov-2026 (D-065).' end,
       terms_checked_on = date '2026-11-13'
  from public.companies c
 where p.company_id = c.id and c.code in ('CRUX', 'E2E-SYNTH') and p.provider = 'gemini_free';

-- 2) Room for the owner's 26 keys, one slot each (owner, 13-Nov: every key is a separate Google project with its own quota).
update public.companies set ai_connection_limit = 30 where code = 'CRUX' and ai_connection_limit < 30;

-- 3) Named, KEYLESS slots. The owner pastes each key in Admin -> AI connections; nothing here holds a key.
--    Process Agent 1-9  -> discovery interviews; each employee sticks to one slot (spread by member), others are fallback.
--    PDM Agent 1-8      -> one or two per expert team, sized to that team's share of board turns.
--    PD Agent 1-9       -> unassigned overflow pool (9 separate quotas) for everything; to be dedicated to new reviewers as they are built.
do $slots$
declare v_co uuid; r record; v_id uuid;
begin
  select id into v_co from public.companies where code = 'CRUX';
  if v_co is null then return; end if;
  update public.ai_provider_connections set name = 'PD Agent 1' where company_id = v_co and name = 'PD Agents (shared project)';  -- renamed 13-Nov
  for r in select * from (values
      ('Process Agent 1', 'discovery'), ('Process Agent 2', 'discovery'), ('Process Agent 3', 'discovery'),
      ('Process Agent 4', 'discovery'), ('Process Agent 5', 'discovery'), ('Process Agent 6', 'discovery'),
      ('Process Agent 7', 'discovery'), ('Process Agent 8', 'discovery'), ('Process Agent 9', 'discovery'),
      ('PDM Agent 1', 'team:pmo'),   ('PDM Agent 2', 'team:pmo'),
      ('PDM Agent 3', 'team:legal'), ('PDM Agent 4', 'team:legal'),
      ('PDM Agent 5', 'team:cs'),    ('PDM Agent 6', 'team:finance'),
      ('PDM Agent 7', 'team:docs'),  ('PDM Agent 8', 'team:audit'),
      ('PD Agent 1', null), ('PD Agent 2', null), ('PD Agent 3', null), ('PD Agent 4', null), ('PD Agent 5', null),
      ('PD Agent 6', null), ('PD Agent 7', null), ('PD Agent 8', null), ('PD Agent 9', null)) as v(name, cat)
  loop
    insert into public.ai_provider_connections (company_id, name, provider, policy_provider, model, priority, health)
    values (v_co, r.name, 'gemini', 'gemini_free', 'gemini-flash-lite-latest', case when r.cat is null then 50 else 100 end, 'not_configured')
    on conflict (company_id, name) do nothing;
    select id into v_id from public.ai_provider_connections where company_id = v_co and name = r.name;
    if r.cat is not null and not exists (select 1 from public.ai_connection_assignments a where a.company_id = v_co and a.connection_id = v_id
                                          and a.department_id is null and a.process_id is null and a.interview_category = r.cat) then
      insert into public.ai_connection_assignments (company_id, connection_id, interview_category) values (v_co, v_id, r.cat);
    end if;
  end loop;
end $slots$;
