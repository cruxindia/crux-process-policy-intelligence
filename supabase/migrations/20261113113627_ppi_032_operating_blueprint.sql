-- PPI-032 (blueprint §4): Company Operating Blueprint — the agreed understanding of what CRUX does, whom it serves, what it wants to
-- achieve and which standards it must meet, built BEFORE department documents and referred to by them.
--  * Leadership discovery: a fixed interview (scope 'leadership', 20 questions over the 16 areas and the four voices).
--  * Entries per area / voice (VOC customer, VOB business, VOE employee, VOR regulator & risk): AI-proposed entries cite their sources and
--    count only once a blueprint manager confirms them; managers may also write entries directly.
--  * Open questions the AI could not answer from the sources go to named leaders (the consultant's open-points list).
--  * CTQs (critical to quality): proposed by AI or managers WITHOUT targets; a target is requested by one person and approved by another.
--    The AI can never set a target (no path exists; constraints below).
--  * Published versions are immutable snapshots; core areas must be confirmed before the first publication.

insert into public.permissions (code, description) values
  ('blueprint.manage',  'Run the company blueprint: leadership interview, review AI proposals, maintain entries and CTQs, request targets'),
  ('blueprint.approve', 'Approve CTQ targets and publish blueprint versions (maker-checker)')
on conflict (code) do nothing;
insert into public.role_permissions (company_id, role_id, permission_code)
select distinct rp.company_id, rp.role_id, p.code from public.role_permissions rp
 cross join (values ('blueprint.manage'), ('blueprint.approve')) p(code) where rp.permission_code = 'org.manage'
on conflict do nothing;
insert into public.role_permissions (company_id, role_id, permission_code)
select distinct rp.company_id, rp.role_id, 'blueprint.approve' from public.role_permissions rp where rp.permission_code = 'document.approve'
on conflict do nothing;

-- Leadership interview = an ordinary fixed interview with its own question scope.
alter table public.question_templates drop constraint question_templates_scope_type_check;
alter table public.question_templates add constraint question_templates_scope_type_check
  check (scope_type in ('company_dna','department','process','policy','voc','general','leadership'));
alter table public.interview_campaigns drop constraint interview_campaigns_scopes_chk;
alter table public.interview_campaigns add constraint interview_campaigns_scopes_chk
  check (question_scopes is null or question_scopes <@ array['general','company_dna','department','process','policy','voc','leadership']::text[]);
alter table public.interview_campaigns add column purpose_kind text not null default 'standard' check (purpose_kind in ('standard', 'leadership'));

alter table public.ai_runs drop constraint ai_runs_capability_check;
alter table public.ai_runs add constraint ai_runs_capability_check check (capability in ('interview_followup','answer_extraction',
  'process_architect','contradiction_analysis','risk_control_analysis','legal_source_research','document_draft','completeness_review',
  'change_impact','summary','board_turn','blueprint_synthesis'));

create or replace function private.blueprint_sections() returns text[] language sql immutable as $$
  select array['identity','purpose','business_model','services','customers','customer_expectations','footprint','organisation',
               'people_authority','technology','partners','objectives','challenges','risk_appetite','legal_environment','future_direction',
               'voc','vob','voe','vor']
$$;

create table public.blueprint_entries (
  id                  uuid not null default gen_random_uuid(),
  company_id          uuid not null references public.companies(id),
  section             text not null check (section = any (private.blueprint_sections())),
  statement           text not null check (length(statement) between 3 and 1500),
  original_statement  text,                              -- the AI's wording when a manager edited it on confirmation
  source_kind         text not null check (source_kind in ('ai_synthesis', 'manual', 'leadership_followup')),
  source_refs         jsonb not null default '[]'::jsonb check (jsonb_typeof(source_refs) = 'array'),
  status              text not null default 'proposed' check (status in ('proposed', 'confirmed', 'rejected')),
  proposed_by         uuid,                              -- membership (null when the AI proposed it)
  ai_run_id           uuid,
  synthesis_id        uuid,
  decided_by          uuid,
  decided_at          timestamptz,
  decision_note       text,
  created_at          timestamptz not null default now(),
  primary key (id), unique (company_id, id),
  check ((status = 'proposed') = (decided_by is null)),
  check (source_kind <> 'ai_synthesis' or (proposed_by is null and jsonb_array_length(source_refs) > 0))
);
create index blueprint_entries_idx on public.blueprint_entries (company_id, section, status);

create table public.blueprint_open_questions (
  id            uuid not null default gen_random_uuid(),
  company_id    uuid not null references public.companies(id),
  section       text not null check (section = any (private.blueprint_sections())),
  question      text not null check (length(question) between 5 and 600),
  status        text not null default 'open' check (status in ('open', 'answered', 'dismissed')),
  synthesis_id  uuid,
  assigned_to   uuid,                                    -- membership of the leader asked to answer
  answer        text,
  answered_by   uuid,
  answered_at   timestamptz,
  created_at    timestamptz not null default now(),
  primary key (id), unique (company_id, id),
  check ((status = 'answered') = (answer is not null and answered_by is not null))
);
create index blueprint_questions_idx on public.blueprint_open_questions (company_id, status);

create table public.ctq_items (
  id                   uuid not null default gen_random_uuid(),
  company_id           uuid not null references public.companies(id),
  code                 text not null check (code ~ '^CTQ-[0-9]{2,3}$'),
  name                 text not null check (length(name) between 3 and 200),
  voice                text not null check (voice in ('voc', 'vob', 'voe', 'vor')),
  expectation          text,                             -- the voice / expectation it comes from, in words
  measure              text not null check (length(measure) between 3 and 600),
  unit                 text,
  direction            text not null default 'higher_better' check (direction in ('higher_better', 'lower_better', 'range')),
  baseline             text,
  target_value         numeric,
  target_text          text,
  status               text not null default 'proposed' check (status in ('proposed', 'pending_approval', 'approved', 'rejected', 'retired')),
  source_kind          text not null check (source_kind in ('ai_synthesis', 'manual')),
  source_refs          jsonb not null default '[]'::jsonb,
  proposed_by          uuid,
  ai_run_id            uuid,
  synthesis_id         uuid,
  target_requested_by  uuid,
  target_requested_at  timestamptz,
  target_reason        text,
  approved_by          uuid,
  approved_at          timestamptz,
  decision_note        text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  primary key (id), unique (company_id, id), unique (company_id, code),
  -- Targets exist only once a person has requested one; the AI never sets them.
  check (status in ('pending_approval', 'approved') or (target_value is null and target_text is null)),
  check (status not in ('pending_approval', 'approved') or ((target_value is not null or target_text is not null) and target_requested_by is not null)),
  check (status <> 'approved' or (approved_by is not null and approved_by <> target_requested_by))
);

create table public.blueprint_versions (
  id            uuid not null default gen_random_uuid(),
  company_id    uuid not null references public.companies(id),
  version       int  not null check (version > 0),
  content       jsonb not null,
  note          text,
  published_by  uuid not null,
  published_at  timestamptz not null default now(),
  primary key (id), unique (company_id, id), unique (company_id, version)
);
create trigger blueprint_versions_immutable before update or delete on public.blueprint_versions for each row execute function private.forbid_mutation();

-- One AI synthesis at a time per company; the row is the run's status for the page.
create table public.blueprint_syntheses (
  id            uuid not null default gen_random_uuid(),
  company_id    uuid not null references public.companies(id),
  requested_by  uuid not null,
  status        text not null default 'running' check (status in ('running', 'succeeded', 'failed')),
  counts        jsonb not null default '{}'::jsonb,
  error_text    text,
  started_at    timestamptz not null default now(),
  finished_at   timestamptz,
  primary key (id), unique (company_id, id)
);
create unique index blueprint_one_running on public.blueprint_syntheses (company_id) where status = 'running';

create trigger audit_blueprint_entries after insert or update or delete on public.blueprint_entries for each row execute function private.audit_row();
create trigger audit_blueprint_questions after insert or update or delete on public.blueprint_open_questions for each row execute function private.audit_row();
create trigger audit_ctq_items after insert or update or delete on public.ctq_items for each row execute function private.audit_row();
create trigger audit_blueprint_versions after insert on public.blueprint_versions for each row execute function private.audit_row();
create trigger ctq_updated_at before update on public.ctq_items for each row execute function private.set_updated_at();

create or replace function private.blueprint_curator(p_company uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select private.has_permission_anywhere(p_company, 'blueprint.manage') or private.has_permission_anywhere(p_company, 'blueprint.approve')
$$;
revoke all on function private.blueprint_curator(uuid) from public, anon;
grant execute on function private.blueprint_curator(uuid) to authenticated;

alter table public.blueprint_entries enable row level security;
alter table public.blueprint_open_questions enable row level security;
alter table public.ctq_items enable row level security;
alter table public.blueprint_versions enable row level security;
alter table public.blueprint_syntheses enable row level security;
-- Everyone in the company may read the agreed blueprint; proposals (which may quote leadership interviews) stay with the curators.
create policy blueprint_entries_read on public.blueprint_entries for select to authenticated using (
  (select private.my_membership(company_id)) is not null and (status = 'confirmed' or (select private.blueprint_curator(company_id))));
create policy blueprint_questions_read on public.blueprint_open_questions for select to authenticated using (
  (select private.blueprint_curator(company_id)) or assigned_to = (select private.my_membership(company_id)));
create policy ctq_read on public.ctq_items for select to authenticated using (
  (select private.my_membership(company_id)) is not null and (status = 'approved' or (select private.blueprint_curator(company_id))));
create policy blueprint_versions_read on public.blueprint_versions for select to authenticated using ((select private.my_membership(company_id)) is not null);
create policy blueprint_syntheses_read on public.blueprint_syntheses for select to authenticated using ((select private.blueprint_curator(company_id)));
revoke insert, update, delete, truncate, references, trigger on public.blueprint_entries, public.blueprint_open_questions, public.ctq_items,
  public.blueprint_versions, public.blueprint_syntheses from authenticated, anon;
grant select on public.blueprint_entries, public.blueprint_open_questions, public.ctq_items, public.blueprint_versions, public.blueprint_syntheses to authenticated;

create or replace function private.require_blueprint(p_company uuid, p_perm text) returns uuid language plpgsql stable security definer set search_path = '' as $$
declare v_mid uuid := private.my_membership(p_company);
begin
  if v_mid is null or not private.is_human_actor(p_company) then raise exception 'PPI_FORBIDDEN: people only' using errcode = '42501'; end if;
  if not private.has_permission_anywhere(p_company, p_perm) then
    raise exception 'PPI_FORBIDDEN: % is needed for this', case p_perm when 'blueprint.approve' then 'blueprint approval' else 'blueprint management' end using errcode = '42501';
  end if;
  return v_mid;
end $$;
revoke all on function private.require_blueprint(uuid, text) from public, anon, authenticated;

-- What the caller may do (for the page and the Edge Function).
create or replace function public.blueprint_my_rights(p_company uuid) returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('member', private.my_membership(p_company) is not null,
    'manage', private.has_permission_anywhere(p_company, 'blueprint.manage'), 'approve', private.has_permission_anywhere(p_company, 'blueprint.approve'))
$$;

-- Leadership questions (consultant's company discovery, §4A + §4B). Idempotent; returns the number added.
create or replace function private.seed_leadership_templates(p_company uuid) returns int language plpgsql security definer set search_path = '' as $$
declare v_n int;
begin
  insert into public.question_templates (company_id, code, version, scope_type, field_key, question_text, help_text, answer_type, status)
  select p_company, q.code, 1, 'leadership', 'blueprint.' || q.sec, q.txt, q.help, 'text', 'active'
    from (values
      ('L-01','identity','Please describe CRUX as a company: its history, legal entities, ownership and how it has grown.', 'Founding year, group companies, who owns and who governs it.'),
      ('L-02','purpose','Why does CRUX exist? What problem does it solve for its clients?', 'One or two sentences you would put on the first page of the company profile.'),
      ('L-03','business_model','How does CRUX earn its revenue and deliver its services? Who pays, for what, and how is work priced?', 'Per case, per visit, retainers, franchise share — whatever applies.'),
      ('L-04','services','List every service or business line CRUX offers, and what each one includes and excludes.', null),
      ('L-05','customers','Who are CRUX''s customers (banks, NBFCs, corporates, others)? Which matter most, and why?', null),
      ('L-06','customer_expectations','What do clients expect from CRUX — turnaround, accuracy, confidentiality, reporting? What do they complain about most?', 'This is the voice of the customer.'),
      ('L-07','footprint','Where does CRUX operate — zones, branches, self-operated and franchise — and how is coverage organised?', null),
      ('L-08','organisation','How is CRUX organised: departments, teams and reporting lines? Where are responsibilities unclear or shared?', null),
      ('L-09','people_authority','Who decides what? Name the key designations, the decisions they own and any approval limits.', 'For example who approves pricing, refunds, hiring, partner onboarding, exceptions.'),
      ('L-10','technology','Which systems and tools does CRUX use (for example Force1, email, WhatsApp, Excel, client portals) and what is each used for?', null),
      ('L-11','partners','Which partners, franchisees, field resources and vendors does CRUX rely on, and for what?', null),
      ('L-12','objectives','What are the business objectives for the next 12–24 months — growth, profitability, productivity, quality, client satisfaction?', 'This is the voice of the business. Say how you would measure each one if you can.'),
      ('L-13','challenges','What are the biggest problems today — bottlenecks, losses, delays, duplication, recurring failures?', null),
      ('L-14','risk_appetite','Which risks is CRUX willing to accept, and which must never happen?', null),
      ('L-15','legal_environment','Which laws, client contract terms, audits or security requirements must CRUX meet? Name client-specific rules you know.', 'This is the voice of the regulator and risk.'),
      ('L-16','future_direction','Where is CRUX heading — expansion, automation, new services, strategic priorities?', null),
      ('L-17','voe','What do employees need to do their jobs well, and what gets in their way today?', 'This is the voice of the employee, as leadership sees it.'),
      ('L-18','vor','If a client auditor or regulator inspected CRUX tomorrow, what would they check first, and where would we be weakest?', null),
      ('L-19','vob','How will management know the company is doing well? Which measures do you watch, and what results would you call good?', 'Targets are only adopted after management approval in the platform.'),
      ('L-20','challenges','Is there anything else a consultant should know to understand how CRUX really works?', null)
    ) q(code, sec, txt, help)
   where not exists (select 1 from public.question_templates t where t.company_id = p_company and t.code = q.code);
  get diagnostics v_n = row_count;
  return v_n;
end $$;
revoke all on function private.seed_leadership_templates(uuid) from public, anon, authenticated;

-- Start (or extend) the leadership discovery: one campaign per company, one interview per chosen leader.
create or replace function public.blueprint_start_leadership(p_company uuid, p_members uuid[]) returns int
language plpgsql security definer set search_path = '' as $$
declare v_mid uuid := private.require_blueprint(p_company, 'blueprint.manage'); v_campaign uuid; v_m uuid; v_dept uuid; v_n int := 0;
begin
  if coalesce(cardinality(p_members), 0) = 0 then raise exception 'PPI_INPUT: choose at least one leader' using errcode = 'P0001'; end if;
  perform private.seed_leadership_templates(p_company);
  select id into v_campaign from public.interview_campaigns where company_id = p_company and purpose_kind = 'leadership' order by created_at limit 1;
  if v_campaign is null then
    insert into public.interview_campaigns (company_id, code, name, purpose, owner_membership_id, status, question_scopes, interview_mode, purpose_kind)
    values (p_company, 'BLUEPRINT-LEADERSHIP', 'Company Operating Blueprint — leadership discovery',
            'What CRUX does, whom it serves, what it wants to achieve and which standards it must meet. Department documents are built on it.',
            v_mid, 'active', array['leadership'], 'fixed', 'leadership')
    returning id into v_campaign;
  end if;
  foreach v_m in array p_members loop
    select primary_department_id into v_dept from public.memberships where company_id = p_company and id = v_m and status = 'active';
    if not found then raise exception 'PPI_INPUT: a chosen person is not an active member' using errcode = 'P0001'; end if;
    if v_dept is null then raise exception 'PPI_INPUT: set the department of every chosen leader first (Admin → People)' using errcode = 'P0001'; end if;
    insert into public.interview_assignments (company_id, campaign_id, respondent_membership_id, department_id)
    values (p_company, v_campaign, v_m, v_dept) on conflict do nothing;
    if found then v_n := v_n + 1; end if;
  end loop;
  return v_n;
end $$;

create or replace function public.blueprint_add_entry(p_company uuid, p_section text, p_statement text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_mid uuid := private.require_blueprint(p_company, 'blueprint.manage'); v_id uuid;
begin
  if not p_section = any (private.blueprint_sections()) then raise exception 'PPI_INPUT: unknown section' using errcode = 'P0001'; end if;
  if length(trim(coalesce(p_statement, ''))) < 3 then raise exception 'PPI_INPUT: write the statement' using errcode = 'P0001'; end if;
  insert into public.blueprint_entries (company_id, section, statement, source_kind, status, proposed_by, decided_by, decided_at)
  values (p_company, p_section, trim(p_statement), 'manual', 'confirmed', v_mid, v_mid, now()) returning id into v_id;
  return v_id;
end $$;

create or replace function public.blueprint_decide_entry(p_company uuid, p_entry uuid, p_decision text, p_statement text default null, p_note text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare v_mid uuid := private.require_blueprint(p_company, 'blueprint.manage'); e public.blueprint_entries;
begin
  select * into e from public.blueprint_entries where company_id = p_company and id = p_entry for update;
  if e.id is null then raise exception 'PPI_INPUT: entry not found' using errcode = 'P0001'; end if;
  if e.status <> 'proposed' then raise exception 'PPI_INPUT: this entry was already decided' using errcode = 'P0001'; end if;
  if p_decision = 'rejected' and length(trim(coalesce(p_note, ''))) < 3 then raise exception 'PPI_INPUT: give a reason for rejecting' using errcode = 'P0001'; end if;
  if p_decision not in ('confirmed', 'rejected') then raise exception 'PPI_INPUT: unknown decision' using errcode = 'P0001'; end if;
  update public.blueprint_entries set status = p_decision, decided_by = v_mid, decided_at = now(), decision_note = nullif(trim(p_note), ''),
         original_statement = case when p_decision = 'confirmed' and nullif(trim(p_statement), '') is not null and trim(p_statement) <> statement then statement end,
         statement = case when p_decision = 'confirmed' and nullif(trim(p_statement), '') is not null then trim(p_statement) else statement end
   where company_id = p_company and id = p_entry;
end $$;

create or replace function public.blueprint_assign_question(p_company uuid, p_question uuid, p_member uuid, p_dismiss boolean default false)
returns void language plpgsql security definer set search_path = '' as $$
declare v_mid uuid := private.require_blueprint(p_company, 'blueprint.manage');
begin
  if p_dismiss then
    update public.blueprint_open_questions set status = 'dismissed' where company_id = p_company and id = p_question and status = 'open';
  else
    if not exists (select 1 from public.memberships where company_id = p_company and id = p_member and status = 'active') then
      raise exception 'PPI_INPUT: person not found' using errcode = 'P0001'; end if;
    update public.blueprint_open_questions set assigned_to = p_member where company_id = p_company and id = p_question and status = 'open';
  end if;
  if not found then raise exception 'PPI_INPUT: open question not found' using errcode = 'P0001'; end if;
end $$;

-- The assigned leader (or a manager) answers; the answer becomes a proposed entry for the next review.
create or replace function public.blueprint_answer_question(p_company uuid, p_question uuid, p_answer text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_mid uuid := private.my_membership(p_company); q public.blueprint_open_questions;
begin
  if v_mid is null or not private.is_human_actor(p_company) then raise exception 'PPI_FORBIDDEN: people only' using errcode = '42501'; end if;
  select * into q from public.blueprint_open_questions where company_id = p_company and id = p_question for update;
  if q.id is null or q.status <> 'open' then raise exception 'PPI_INPUT: open question not found' using errcode = 'P0001'; end if;
  if q.assigned_to is distinct from v_mid and not private.has_permission_anywhere(p_company, 'blueprint.manage') then
    raise exception 'PPI_FORBIDDEN: this question is assigned to someone else' using errcode = '42501'; end if;
  if length(trim(coalesce(p_answer, ''))) < 3 then raise exception 'PPI_INPUT: write an answer' using errcode = 'P0001'; end if;
  update public.blueprint_open_questions set status = 'answered', answer = trim(p_answer), answered_by = v_mid, answered_at = now()
   where company_id = p_company and id = p_question;
  insert into public.blueprint_entries (company_id, section, statement, source_kind, source_refs, status, proposed_by)
  values (p_company, q.section, left(trim(p_answer), 1500), 'leadership_followup', jsonb_build_array(jsonb_build_object('question_id', q.id, 'question', q.question)), 'proposed', v_mid);
end $$;

create or replace function public.ctq_save(p_company uuid, p_id uuid, p_name text, p_voice text, p_measure text, p_unit text, p_direction text,
  p_baseline text, p_expectation text default null) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_mid uuid := private.require_blueprint(p_company, 'blueprint.manage'); v_id uuid; v_code text;
begin
  if p_voice not in ('voc', 'vob', 'voe', 'vor') or coalesce(p_direction, 'higher_better') not in ('higher_better', 'lower_better', 'range') then
    raise exception 'PPI_INPUT: unknown voice or direction' using errcode = 'P0001'; end if;
  if p_id is null then
    select 'CTQ-' || lpad((coalesce(max(substr(code, 5)::int), 0) + 1)::text, 2, '0') into v_code from public.ctq_items where company_id = p_company;
    insert into public.ctq_items (company_id, code, name, voice, expectation, measure, unit, direction, baseline, source_kind, proposed_by)
    values (p_company, v_code, trim(p_name), p_voice, nullif(trim(p_expectation), ''), trim(p_measure), nullif(trim(p_unit), ''),
            coalesce(p_direction, 'higher_better'), nullif(trim(p_baseline), ''), 'manual', v_mid) returning id into v_id;
  else
    update public.ctq_items set name = trim(p_name), voice = p_voice, measure = trim(p_measure), unit = nullif(trim(p_unit), ''),
           direction = coalesce(p_direction, direction), baseline = nullif(trim(p_baseline), ''), expectation = coalesce(nullif(trim(p_expectation), ''), expectation)
     where company_id = p_company and id = p_id and status = 'proposed' returning id into v_id;
    if v_id is null then raise exception 'PPI_INPUT: only proposed CTQs can be edited' using errcode = 'P0001'; end if;
  end if;
  return v_id;
end $$;

create or replace function public.ctq_request_target(p_company uuid, p_ctq uuid, p_target_value numeric, p_target_text text, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_mid uuid := private.require_blueprint(p_company, 'blueprint.manage');
begin
  if p_target_value is null and nullif(trim(p_target_text), '') is null then raise exception 'PPI_INPUT: give the target' using errcode = 'P0001'; end if;
  if length(trim(coalesce(p_reason, ''))) < 10 then raise exception 'PPI_INPUT: explain where the target comes from (at least 10 characters)' using errcode = 'P0001'; end if;
  update public.ctq_items set status = 'pending_approval', target_value = p_target_value, target_text = nullif(trim(p_target_text), ''),
         target_requested_by = v_mid, target_requested_at = now(), target_reason = trim(p_reason), approved_by = null, approved_at = null, decision_note = null
   where company_id = p_company and id = p_ctq and status in ('proposed', 'approved');
  if not found then raise exception 'PPI_INPUT: CTQ not found or already waiting for approval' using errcode = 'P0001'; end if;
end $$;

create or replace function public.ctq_decide_target(p_company uuid, p_ctq uuid, p_decision text, p_note text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare v_mid uuid := private.require_blueprint(p_company, 'blueprint.approve'); c public.ctq_items;
begin
  select * into c from public.ctq_items where company_id = p_company and id = p_ctq for update;
  if c.id is null or c.status <> 'pending_approval' then raise exception 'PPI_INPUT: nothing is waiting for approval' using errcode = 'P0001'; end if;
  if c.target_requested_by = v_mid then raise exception 'PPI_FORBIDDEN: someone else must approve a target you proposed' using errcode = '42501'; end if;
  if p_decision = 'approved' then
    update public.ctq_items set status = 'approved', approved_by = v_mid, approved_at = now(), decision_note = nullif(trim(p_note), '')
     where company_id = p_company and id = p_ctq;
  elsif p_decision = 'rejected' then
    if length(trim(coalesce(p_note, ''))) < 3 then raise exception 'PPI_INPUT: give a reason for rejecting' using errcode = 'P0001'; end if;
    update public.ctq_items set status = 'proposed', target_value = null, target_text = null, target_requested_by = null, target_requested_at = null,
           target_reason = null, decision_note = trim(p_note) where company_id = p_company and id = p_ctq;
  else raise exception 'PPI_INPUT: unknown decision' using errcode = 'P0001';
  end if;
end $$;

create or replace function public.ctq_retire(p_company uuid, p_ctq uuid, p_note text) returns void language plpgsql security definer set search_path = '' as $$
declare v_mid uuid := private.require_blueprint(p_company, 'blueprint.manage');
begin
  if length(trim(coalesce(p_note, ''))) < 3 then raise exception 'PPI_INPUT: give a reason' using errcode = 'P0001'; end if;
  update public.ctq_items set status = case when status = 'proposed' then 'rejected' else 'retired' end, target_value = null, target_text = null,
         target_requested_by = null, target_requested_at = null, target_reason = null, approved_by = null, approved_at = null, decision_note = trim(p_note)
   where company_id = p_company and id = p_ctq and status in ('proposed', 'approved');
  if not found then raise exception 'PPI_INPUT: CTQ not found' using errcode = 'P0001'; end if;
end $$;

-- Publish an immutable version. The core of the blueprint must be agreed first.
create or replace function public.blueprint_publish(p_company uuid, p_note text) returns int language plpgsql security definer set search_path = '' as $$
declare v_mid uuid := private.require_blueprint(p_company, 'blueprint.approve'); v_missing text[]; v_ver int; v_content jsonb;
begin
  select array_agg(s) into v_missing from unnest(array['purpose','business_model','services','customers','objectives']) s
   where not exists (select 1 from public.blueprint_entries e where e.company_id = p_company and e.section = s and e.status = 'confirmed');
  if v_missing is not null then
    raise exception 'PPI_INPUT: confirm at least one statement for: %', array_to_string(v_missing, ', ') using errcode = 'P0001'; end if;
  select jsonb_build_object(
    'sections', coalesce((select jsonb_object_agg(section, items) from (
        select section, jsonb_agg(statement order by created_at) items from public.blueprint_entries
         where company_id = p_company and status = 'confirmed' group by section) x), '{}'::jsonb),
    'ctqs', coalesce((select jsonb_agg(jsonb_build_object('code', code, 'name', name, 'voice', voice, 'measure', measure, 'unit', unit,
        'direction', direction, 'baseline', baseline, 'target_value', target_value, 'target_text', target_text) order by code)
        from public.ctq_items where company_id = p_company and status = 'approved'), '[]'::jsonb))
    into v_content;
  select coalesce(max(version), 0) + 1 into v_ver from public.blueprint_versions where company_id = p_company;
  insert into public.blueprint_versions (company_id, version, content, note, published_by) values (p_company, v_ver, v_content, nullif(trim(p_note), ''), v_mid);
  return v_ver;
end $$;

do $grants$ declare f text; begin
  foreach f in array array['public.blueprint_my_rights(uuid)', 'public.blueprint_start_leadership(uuid, uuid[])', 'public.blueprint_add_entry(uuid, text, text)',
    'public.blueprint_decide_entry(uuid, uuid, text, text, text)', 'public.blueprint_assign_question(uuid, uuid, uuid, boolean)',
    'public.blueprint_answer_question(uuid, uuid, text)', 'public.ctq_save(uuid, uuid, text, text, text, text, text, text, text)',
    'public.ctq_request_target(uuid, uuid, numeric, text, text)', 'public.ctq_decide_target(uuid, uuid, text, text)', 'public.ctq_retire(uuid, uuid, text)',
    'public.blueprint_publish(uuid, text)'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $grants$;
