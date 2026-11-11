-- Run ONLY after (1) GEMINI_API_KEY is set in Supabase → Edge Functions → Secrets, (2) the admin "Test AI connection"
-- button reports Connected, and (3) the key's Google Cloud project has billing enabled (paid tier). See AI_INTEGRATION.md.
-- Effect: new sign-ups on the existing CRUX join link get the adaptive AI interview. People already interviewed keep
-- their existing (fixed) interviews. Reversible: set the link back to CRUX-DISC-01 and the policy to disabled.
begin;
update public.ai_provider_policies set status = 'active'
 where provider = 'gemini_paid' and company_id = (select id from public.companies where code = 'CRUX');
update public.interview_campaigns set status = 'active'
 where code = 'CRUX-DISC-02' and company_id = (select id from public.companies where code = 'CRUX');
update public.company_join_links l set campaign_id = k.id
  from public.interview_campaigns k
 where k.company_id = l.company_id and k.code = 'CRUX-DISC-02'
   and l.company_id = (select id from public.companies where code = 'CRUX')
   and l.campaign_id = (select id from public.interview_campaigns where code = 'CRUX-DISC-01' and company_id = l.company_id);
commit;
