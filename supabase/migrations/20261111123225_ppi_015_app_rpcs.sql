-- PPI-015 RPCs used by the web app. All are SECURITY INVOKER: RLS and guards still decide everything.

-- Permission codes the caller holds in a company (any scope) — for showing/hiding UI actions only.
-- The database still re-checks every action with scope; this list is never trusted for authorisation.
create or replace function public.my_permissions(p_company uuid) returns setof text
language sql stable security invoker set search_path = '' as $$
  select distinct rp.permission_code
    from public.role_assignments ra
    join public.role_permissions rp on rp.company_id = ra.company_id and rp.role_id = ra.role_id
    join public.memberships m on m.company_id = ra.company_id and m.id = ra.membership_id
   where ra.company_id = p_company and m.user_id = (select auth.uid()) and m.status = 'active'
     and ra.status = 'active' and ra.valid_from <= now() and (ra.valid_to is null or ra.valid_to > now())
$$;

-- Starter discovery questions. Wording derived from MASTER_CLAUDE_BUILD_PROMPT §6.4 (department) and §6.6 (process);
-- generic, contains no CRUX-specific facts. Requires interview.manage (enforced by RLS on question_templates).
create or replace function public.load_starter_templates(p_company uuid) returns int
language plpgsql security invoker set search_path = '' as $$
declare v_count int;
begin
  insert into public.question_templates (company_id, code, version, scope_type, field_key, question_text, help_text, status)
  select p_company, t.code, 1, t.scope, t.field, t.q, t.help, 'active'
    from (values
      ('DEP-01','department','department.purpose','What is the purpose of your department, in one or two sentences?','Describe why the department exists, not a list of tasks.'),
      ('DEP-02','department','department.services','Which services or outputs does your department deliver?','List each service or output separately.'),
      ('DEP-03','department','department.customers','Who receives those outputs — which internal teams or external customers?',null),
      ('DEP-04','department','department.inputs','What inputs do you need, and which teams or parties send them to you?',null),
      ('DEP-05','department','department.roles','Which roles exist in the department and what is each responsible for?','Use role names, not personal names.'),
      ('DEP-06','department','department.systems','Which systems, tools, reports and records do you use?',null),
      ('DEP-07','department','department.decisions','Which recurring decisions does the department make, and who has authority to approve them?',null),
      ('DEP-08','department','department.documents','Which written policies or process documents apply to your work today?','Name them if you know them; say "none" or "unknown" if not.'),
      ('DEP-09','department','department.metrics','Which measures, targets, SLAs or turnaround times apply to your work?','Say "not yet set" if there are none.'),
      ('DEP-10','department','department.pain_points','Where do delays, rework, exceptions or workarounds happen?',null),
      ('DEP-11','department','department.dependencies','Where are handovers with other departments unclear, overlapping or dependent on one person?',null),
      ('DEP-12','department','department.improvements','What would you improve first, and why?',null),
      ('PRC-01','process','process.trigger','What starts this process (the trigger)?',null),
      ('PRC-02','process','process.start_end','Where does the process start and where does it end?',null),
      ('PRC-03','process','process.frequency','How often does it run and in what volume?','Give a typical range if exact numbers are not known.'),
      ('PRC-04','process','process.customer_output','Who is the customer of this process and what output do they receive?',null),
      ('PRC-05','process','process.inputs','What inputs or prerequisites are needed, and where do they come from?',null),
      ('PRC-06','process','process.steps','List the steps in order. For each step: who does it (role/department) and which system is used.',null),
      ('PRC-07','process','process.decisions','At which points is a decision made? What are the conditions and the possible outcomes?',null),
      ('PRC-08','process','process.handoffs','Where is work handed to another team, and how long does it usually wait?',null),
      ('PRC-09','process','process.tat','What turnaround time or SLA applies, and how is it measured?',null),
      ('PRC-10','process','process.exceptions','What exceptions, failures, rework or escalations happen, and how are they handled?',null),
      ('PRC-11','process','process.approvals','Which approvals or authority limits apply, and who holds them?',null),
      ('PRC-12','process','process.records','Which records, evidence or reports are produced, and where are they kept?',null),
      ('PRC-13','process','process.risks_controls','What could go wrong in this process, and what checks exist today?',null),
      ('PRC-14','process','process.links','Which upstream and downstream processes connect to this one?',null)
    ) t(code, scope, field, q, help)
  on conflict (company_id, code, version) do nothing;
  get diagnostics v_count = row_count;
  return v_count;
end $$;

-- Start or resume the caller's interview for an assignment. Returns the open session id.
create or replace function public.start_interview_session(p_assignment uuid) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare v_a record; v_session uuid; v_scope text;
begin
  select a.* into v_a from public.interview_assignments a
   join public.memberships m on m.company_id = a.company_id and m.id = a.respondent_membership_id
   where a.id = p_assignment and m.user_id = (select auth.uid()) and m.status = 'active';
  if v_a.id is null then
    raise exception 'PPI_INTERVIEW: this assignment is not yours' using errcode = 'P0001';
  end if;
  select s.id into v_session from public.interview_sessions s
   where s.company_id = v_a.company_id and s.assignment_id = v_a.id and s.status in ('in_progress','reopened');
  if v_session is not null then return v_session; end if;      -- resume

  -- No RETURNING: it would apply the SELECT policy, whose helper cannot see the row inside the same statement.
  v_session := gen_random_uuid();
  insert into public.interview_sessions (id, company_id, assignment_id) values (v_session, v_a.company_id, v_a.id);
  v_scope := case when v_a.process_id is not null then 'process' else 'department' end;
  insert into public.interview_questions (company_id, session_id, seq, template_id, field_key, question_text, rationale, generated_by)
  select v_a.company_id, v_session, row_number() over (order by t.code), t.id, t.field_key, t.question_text,
         'Standard ' || v_scope || ' discovery question ' || t.code, 'template'
    from (select distinct on (q.code) q.* from public.question_templates q
           where q.company_id = v_a.company_id and q.scope_type = v_scope and q.status = 'active'
           order by q.code, q.version desc) t;
  if v_a.status in ('invited','accepted') then
    update public.interview_assignments set status = 'in_progress' where id = v_a.id;
  end if;
  return v_session;
end $$;

revoke all on function public.my_permissions(uuid), public.load_starter_templates(uuid), public.start_interview_session(uuid) from public, anon;
grant execute on function public.my_permissions(uuid), public.load_starter_templates(uuid), public.start_interview_session(uuid) to authenticated;
