-- D-045 (12-Nov-2026): Shantanu (CRUX) chose the Gemini FREE tier and explicitly accepted that Google may use
-- the interview data ("Free Gemini, I am ok for Google to use my data"). Recorded here with who/when/why; the database
-- still refuses confidential/restricted data for this provider (PPI-023). Idempotent.
update public.ai_provider_policies p
   set max_classification = 'internal',
       training_accepted_by_membership_id = k.owner_membership_id,
       training_accepted_on = date '2026-11-12',
       training_acceptance_note = case c.code
         when 'CRUX' then 'Owner (Shantanu, AVP Operations & Growth) chose Gemini free tier on 12-Nov-2026 and accepted that Google may use interview data to improve its products and that humans may review it. Employees are told in the interview. Confidential data stays blocked.'
         else 'Synthetic test tenant; mirrors the CRUX free-tier decision of 12-Nov-2026 (D-045).' end,
       terms_checked_on = date '2026-11-12',
       notes = 'Gemini API free tier (unpaid): Google may use prompts/responses to improve products; human reviewers may read them. Accepted by owner for internal interview data (D-045).'
  from public.companies c
  join public.interview_campaigns k on k.company_id = c.id and k.code in ('CRUX-DISC-02', 'E2E-ADAPT-01')
 where p.company_id = c.id and p.provider = 'gemini_free';

update public.interview_campaigns set ai_provider = 'gemini_free'
 where code in ('CRUX-DISC-02', 'E2E-ADAPT-01') and ai_provider is distinct from 'gemini_free';

update public.interview_campaigns
   set purpose = 'We are writing down how work really happens today, so we can build accurate SOPs and fix what slows us down. After a few questions about you and the company, an AI interviewer asks one question at a time about your work, building on your answers. “I don''t know” is a fine answer. Nothing you write becomes company policy without human review.'
 where code = 'CRUX-DISC-02';
