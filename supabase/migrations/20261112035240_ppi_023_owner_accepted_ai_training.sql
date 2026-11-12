-- PPI-023: owner-accepted use of a training AI provider (D-045) + admin switch for the interview mode.
-- D-011 limited providers that may train on inputs (e.g. Gemini free tier) to 'public' data. On 12-Nov-2026 the
-- owner explicitly accepted Google using CRUX interview data. This is allowed ONLY when the acceptance is recorded
-- (who, when, why) and never above 'internal' (confidential/restricted data stays blocked).

alter table public.ai_provider_policies
  add column training_accepted_by_membership_id uuid,
  add column training_accepted_on date,
  add column training_acceptance_note text,
  add constraint ai_provider_policies_accepted_by_fkey
    foreign key (company_id, training_accepted_by_membership_id) references public.memberships (company_id, id);

create index ai_provider_policies_accepted_by_idx on public.ai_provider_policies (company_id, training_accepted_by_membership_id);

alter table public.ai_provider_policies drop constraint ai_provider_policies_check;
alter table public.ai_provider_policies add constraint ai_provider_policies_training_check check (
  not may_train_on_inputs
  or max_classification = 'public'
  or (max_classification = 'internal'
      and training_accepted_by_membership_id is not null
      and training_accepted_on is not null
      and length(coalesce(training_acceptance_note, '')) >= 20)
);

comment on column public.ai_provider_policies.training_accepted_by_membership_id is
  'Owner who accepted that this provider may use inputs (e.g. Gemini free tier). Required to send internal data to a training provider.';

-- Policy changes are audited.
create trigger audit_ai_provider_policies after insert or update on public.ai_provider_policies
  for each row execute function private.audit_row();

-- Admin switch: which interview the company's join link starts (fixed questions or the AI interviewer).
-- Only for administrators (org.manage), humans only, audited. Existing interviews are never changed.
create or replace function public.set_join_interview_mode(p_company uuid, p_adaptive boolean)
returns text language plpgsql security definer set search_path = '' as $$
declare v_target uuid; v_code text; v_n int;
begin
  if not (private.is_human_actor(p_company) and private.has_permission(p_company, 'org.manage')) then
    raise exception 'PPI_FORBIDDEN: only administrators can change the interview mode' using errcode = '42501';
  end if;
  select id, code into v_target, v_code from public.interview_campaigns
   where company_id = p_company
     and interview_mode = case when p_adaptive then 'adaptive' else 'fixed' end
     and status in ('active', 'draft') and question_scopes is not null
   order by (status = 'active') desc, created_at desc limit 1;
  if v_target is null then
    raise exception 'PPI_INPUT: no % interview is configured for this company', case when p_adaptive then 'AI' else 'fixed' end
      using errcode = 'P0001';
  end if;
  update public.interview_campaigns set status = 'active' where company_id = p_company and id = v_target and status = 'draft';
  update public.company_join_links set campaign_id = v_target
   where company_id = p_company and status = 'active' and campaign_id is distinct from v_target;
  get diagnostics v_n = row_count;
  insert into public.audit_events (company_id, actor_user_id, actor_type, action, object_type, object_id, changed_fields)
  values (p_company, (select auth.uid()), 'user', case when p_adaptive then 'INTERVIEW_MODE_AI' else 'INTERVIEW_MODE_FIXED' end,
          'interview_campaigns', v_target::text, array['company_join_links.campaign_id']);
  return v_code;
end $$;
revoke all on function public.set_join_interview_mode(uuid, boolean) from public, anon;
grant execute on function public.set_join_interview_mode(uuid, boolean) to authenticated;
