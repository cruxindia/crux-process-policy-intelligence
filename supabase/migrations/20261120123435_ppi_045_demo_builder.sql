-- PPI-045: demo company builder (P8, D-102). Builds a FICTIONAL company — "Velora Assurance Services (Demo)" — with
-- 100 people and a realistic eight-week engagement: discovery conversations (questions + answers), discovered processes
-- with flow maps, a process register with statuses and validations, expert-board documents (approved, awaiting, shared),
-- tasks/tickets with threads, colleague questions, leadership blueprint, CTQs, projects, AI usage and billing.
-- * Every name is invented; e-mail addresses use the reserved .invalid domain; no one can sign in as a demo person
--   until the company's administrator issues a temporary password (Administration → People).
-- * The platform owner is made COMPANY_ADMIN + STAKEHOLDER of the demo, so they can show it with their own login.
-- * Demo invoices use their own series (DEMO/…) and demo companies are excluded from real billing (PPI-044).
-- Run (service role / SQL editor):  select private.build_demo_company();   Re-running refuses if the code already exists.

create or replace function private.build_demo_company(p_code text default 'DEMO', p_name text default 'Velora Assurance Services (Demo)',
  p_owner uuid default null, p_template text default 'CRUX') returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_co uuid; v_owner uuid := coalesce(p_owner, (select user_id from private.platform_admins order by added_at limit 1));
  v_now timestamptz := now(); v_start timestamptz := now() - interval '56 days';
  -- departments: code, name, mandate, size
  d_code text[] := array['LEAD','OPS','FLD','QC','CS','FIN','HR','TECH'];
  d_name text[] := array['Leadership','Verification Operations','Field Investigation','Quality & Compliance','Client Servicing','Finance & Accounts','People & HR','Technology'];
  d_size int[]  := array[5, 28, 22, 10, 12, 8, 7, 8];
  d_ids uuid[] := '{}';
  firsts text[] := array['Aarav','Diya','Kabir','Ananya','Vihaan','Ira','Reyansh','Myra','Arjun','Saanvi','Ishaan','Aadhya','Rohan','Kiara','Advait','Meher','Vivaan','Tara','Shaurya','Anvi',
    'Krish','Navya','Atharv','Riya','Dhruv','Siya','Yash','Pari','Aditya','Avni','Rudra','Kavya','Nikhil','Isha','Pranav','Mira','Sahil','Neel','Zara','Om','Aditi','Varun','Pooja','Kunal','Sneha','Manav','Tanvi','Rahul','Leela','Harsh'];
  lasts text[] := array['Kulkarni','Deshmukh','Iyer','Menon','Bhatt','Chopra','Rao','Joshi','Patil','Nair','Gokhale','Sen','Bose','Pillai','Shetty','Kapoor','Malhotra','Rathod','Sawant','Kamat',
    'Shinde','Banerjee','Dutta','Naidu','Reddy','Hegde','Mahajan','Ghosh','Trivedi','Pandit'];
  titles jsonb := jsonb_build_object(
    'LEAD', jsonb_build_array('Managing Director','Chief Operating Officer','Head of Business Excellence','Chief Financial Officer','Head of Client Relations'),
    'OPS', jsonb_build_array('Head of Verification Operations','Operations Manager','Team Lead — Verification','Senior Verification Executive','Verification Executive','Back-office Executive','MIS Executive'),
    'FLD', jsonb_build_array('Head of Field Investigation','Zonal Field Manager','Field Supervisor','Senior Field Investigator','Field Investigator'),
    'QC', jsonb_build_array('Head of Quality & Compliance','Compliance Manager','Quality Analyst','Internal Auditor'),
    'CS', jsonb_build_array('Head of Client Servicing','Key Account Manager','Client Servicing Executive','Business Development Manager'),
    'FIN', jsonb_build_array('Head of Finance','Accounts Manager','Billing Executive','Accounts Executive'),
    'HR', jsonb_build_array('Head of People & HR','HR Business Partner','Recruitment Executive','Payroll Executive'),
    'TECH', jsonb_build_array('Head of Technology','Application Lead','Developer','IT Support Engineer'));
  -- process library per department: name | purpose | 5 step labels | system
  lib jsonb := jsonb_build_object(
    'OPS', jsonb_build_array(
      jsonb_build_array('Case receipt and registration','Log every client request the same day so nothing is lost','Receive case from client portal','Check mandatory documents','Register case in case system','Send acknowledgement to client','Queue for allocation','Case system'),
      jsonb_build_array('Case allocation to field officers','Give each case to the right investigator by pincode and load','Review new cases by pincode','Check investigator load','Assign case','Confirm acceptance','Reassign if declined','Allocation sheet'),
      jsonb_build_array('Report preparation','Turn field evidence into a clear, defensible report','Collect field evidence','Draft findings','Attach photos and documents','Peer check','Send to quality check','Report builder'),
      jsonb_build_array('TAT monitoring','Keep every case within the agreed turnaround time','Pull daily ageing list','Flag cases near TAT','Call responsible investigator','Escalate breaches','Update client on delays','MIS dashboard'),
      jsonb_build_array('Rework and complaint resolution','Fix reports the client rejects, and learn why','Log client rejection','Find root cause','Assign rework','Re-check report','Resubmit and record reason','Case system')),
    'FLD', jsonb_build_array(
      jsonb_build_array('Field visit planning','Plan routes so investigators reach more addresses per day','Receive allocated cases','Group by area','Fix visit slots','Share route with investigator','Confirm with applicant','Route planner'),
      jsonb_build_array('Residence and office verification','Confirm the applicant really lives and works where stated','Reach address','Meet applicant or neighbour','Capture geo-tagged photos','Verify documents','Upload visit form','Field app'),
      jsonb_build_array('Evidence and document collection','Collect evidence that will stand up to client audit','List required evidence','Collect documents','Scan and tag','Check legibility','Upload to case','Field app'),
      jsonb_build_array('Field partner payments','Pay field partners correctly and on time','Compile completed visits','Validate with case system','Approve by zonal manager','Send to finance','Share payout statement','Payout sheet')),
    'QC', jsonb_build_array(
      jsonb_build_array('Quality checks and rejection','Catch errors before the client does','Sample completed reports','Check against checklist','Mark pass or reject','Return with reasons','Track rejection rate','QC tracker'),
      jsonb_build_array('Internal audit of branches','Make sure every branch follows the same standard','Plan audit calendar','Visit branch','Test sample cases','Record findings','Follow up actions','Audit register'),
      jsonb_build_array('Data privacy handling','Protect applicant personal data end to end','Classify data received','Restrict access','Mask in reports','Log disclosures','Delete after retention','Access log')),
    'CS', jsonb_build_array(
      jsonb_build_array('Client onboarding','Start every new client with clear scope, SLA and contacts','Receive signed agreement','Set up client in system','Agree SLA and formats','Train client users','First-case review','CRM'),
      jsonb_build_array('Client complaint handling','Resolve client complaints fast and fix the cause','Log complaint','Acknowledge within 4 hours','Investigate with operations','Agree corrective action','Close with client','CRM'),
      jsonb_build_array('Monthly client review','Show clients performance and agree improvements','Prepare MIS pack','Review TAT and quality','Discuss issues','Agree actions','Send minutes','MIS dashboard')),
    'FIN', jsonb_build_array(
      jsonb_build_array('Client billing','Bill every completed case correctly each month','Pull completed cases','Apply client rates','Prepare invoice','Approve invoice','Send to client','Accounting system'),
      jsonb_build_array('Collections follow-up','Collect receivables on time','List overdue invoices','Call client accounts team','Escalate beyond 60 days','Record promises','Update receivables','Accounting system'),
      jsonb_build_array('Expense approval and reimbursement','Reimburse genuine expenses quickly','Submit claim with bills','Manager approval','Finance check','Pay in next cycle','Record in books','Expense app')),
    'HR', jsonb_build_array(
      jsonb_build_array('Recruitment','Hire the right people quickly','Raise requisition','Source candidates','Interview','Background check','Issue offer','HR system'),
      jsonb_build_array('Employee onboarding','Make new joiners productive in their first week','Collect joining documents','Create accounts','Induction session','Assign buddy','30-day check-in','HR system'),
      jsonb_build_array('Attendance and leave','Keep attendance accurate for payroll','Mark daily attendance','Approve leave','Reconcile with field app','Lock monthly attendance','Send to payroll','HR system')),
    'TECH', jsonb_build_array(
      jsonb_build_array('User access management','Give the right access and remove it on exit','Receive access request','Manager approval','Create access','Quarterly access review','Revoke on exit','Access register'),
      jsonb_build_array('Application change management','Change systems safely without breaking operations','Log change request','Assess impact','Test in staging','Approve release','Deploy and monitor','Ticketing tool'),
      jsonb_build_array('Data backup and recovery','Never lose case data','Run nightly backup','Verify backup','Store off-site copy','Quarterly restore test','Report status','Backup console')),
    'LEAD', jsonb_build_array(
      jsonb_build_array('Monthly management review','Decide on performance, risks and priorities every month','Collect department MIS','Review KPIs','Discuss risks','Decide actions','Track action items','MIS dashboard'),
      jsonb_build_array('Delegation of authority','Make clear who may approve what','Define approval limits','Publish matrix','Apply in approvals','Review exceptions','Update yearly','Policy portal')));
  qtopics text[] := array['role','responsibilities','process_inventory','process_steps','systems','handover','exceptions','controls','pain_points','improvement'];
  i int; j int; k int; n int := 0; v_dept uuid; v_dc text; v_uid uuid; v_mid uuid; v_name text; v_title text;
  v_mids uuid[] := '{}'; v_mdept text[] := '{}'; v_head uuid[] := '{}'; v_ceo uuid; v_coo uuid; v_beh uuid; v_cfo uuid; v_owner_mid uuid;
  v_camp uuid; v_asg uuid; v_ses uuid; v_q uuid; v_prompt uuid; v_board_prompt uuid; v_role record;
  v_p jsonb; v_proc jsonb; v_nodes jsonb; v_edges jsonb; v_dp uuid; v_t timestamptz; v_status text; v_pick int;
  v_fn uuid; v_item record; v_case uuid; v_tkt uuid; v_task uuid; v_proj uuid; v_plan uuid; v_inv uuid; r record;
  v_answers int := 0; v_tickets int := 0; v_dps int := 0; v_run uuid;
begin
  if exists (select 1 from public.companies where code = upper(p_code)) then
    raise exception 'PPI_INPUT: a company with code % already exists', p_code using errcode = 'P0001'; end if;
  v_co := private.provision_company(p_code, p_name, p_template, true);
  update public.companies set status_note = 'Demonstration company with invented people and data' where id = v_co;
  select id into v_prompt from public.prompt_versions where company_id = v_co and status = 'active' order by (prompt_key = 'interview.discovery') desc, created_at desc limit 1;
  select id into v_board_prompt from public.prompt_versions where company_id = v_co and status = 'active' order by (prompt_key = 'board.turn') desc, created_at desc limit 1;

  -- departments
  for i in 1 .. array_length(d_code, 1) loop
    insert into public.departments (company_id, code, name, mandate) values (v_co, d_code[i], d_name[i], 'Demo department') returning id into v_dept;
    d_ids := d_ids || v_dept;
  end loop;

  -- 100 people (no usable password: an administrator issues a temporary one to demo a persona)
  for i in 1 .. array_length(d_code, 1) loop
    for j in 1 .. d_size[i] loop
      n := n + 1;
      v_name := firsts[1 + ((n * 7) % array_length(firsts, 1))] || ' ' || lasts[1 + ((n * 11 + i) % array_length(lasts, 1))];
      v_title := case when j = 1 or d_code[i] = 'LEAD' then titles -> d_code[i] ->> least(j - 1, jsonb_array_length(titles -> d_code[i]) - 1)
                      else titles -> d_code[i] ->> (1 + (j % (jsonb_array_length(titles -> d_code[i]) - 1))) end;
      v_uid := gen_random_uuid();
      insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
                              confirmation_token, recovery_token, email_change_token_new, email_change)
      values (v_uid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
              lower(replace(v_name, ' ', '.')) || '.' || n || '.' || lower(p_code) || '@velora-demo.invalid', extensions.crypt(gen_random_uuid()::text, extensions.gen_salt('bf', 6)),
              v_start, '{"provider":"email","providers":["email"]}', '{"demo":true}', v_start, v_start, '', '', '', '');
      insert into auth.identities (id, user_id, provider_id, identity_data, provider, created_at, updated_at)
      values (gen_random_uuid(), v_uid, v_uid::text, jsonb_build_object('sub', v_uid::text, 'email', lower(replace(v_name, ' ', '.')) || '.' || n || '.' || lower(p_code) || '@velora-demo.invalid', 'email_verified', true), 'email', v_start, v_start);
      insert into public.user_profiles (id, display_name) values (v_uid, v_name);
      insert into public.memberships (company_id, user_id, primary_department_id, job_title, status, created_at)
      values (v_co, v_uid, d_ids[i], v_title, case when n % 33 = 0 then 'invited' else 'active' end, v_start + ((n % 10) || ' hours')::interval)
      returning id into v_mid;
      v_mids := v_mids || v_mid; v_mdept := v_mdept || d_code[i];
      insert into public.role_assignments (company_id, membership_id, role_id, scope_type)
      select v_co, v_mid, id, 'company' from public.roles where company_id = v_co and code = 'EMPLOYEE';
      if j = 1 then v_head := v_head || v_mid;
        insert into public.role_assignments (company_id, membership_id, role_id, scope_type, scope_department_id)
        select v_co, v_mid, id, 'department', d_ids[i] from public.roles where company_id = v_co and code = 'DEPT_HEAD';
      end if;
      if j = 2 and d_code[i] <> 'LEAD' then
        insert into public.role_assignments (company_id, membership_id, role_id, scope_type, scope_department_id)
        select v_co, v_mid, id, 'department', d_ids[i] from public.roles where company_id = v_co and code = 'PROCESS_OWNER';
      end if;
      if d_code[i] = 'LEAD' then
        if j = 1 then v_ceo := v_mid; elsif j = 2 then v_coo := v_mid; elsif j = 3 then v_beh := v_mid; elsif j = 4 then v_cfo := v_mid; end if;
        insert into public.role_assignments (company_id, membership_id, role_id, scope_type)
        select v_co, v_mid, r2.id, 'company' from public.roles r2 where r2.company_id = v_co
           and r2.code = any (case j when 1 then array['COMPANY_ADMIN','DOC_APPROVER','STAKEHOLDER'] when 2 then array['STAKEHOLDER','DOC_APPROVER']
                                     when 3 then array['DISCOVERY_LEAD','BE_REVIEWER','STAKEHOLDER'] else array['STAKEHOLDER'] end);
      end if;
    end loop;
  end loop;

  -- the platform owner runs the demo as its administrator
  if v_owner is not null then
    insert into public.memberships (company_id, user_id, primary_department_id, job_title, status, created_at)
    values (v_co, v_owner, d_ids[1], 'Demo administrator', 'active', v_start) returning id into v_owner_mid;
    insert into public.role_assignments (company_id, membership_id, role_id, scope_type)
    select v_co, v_owner_mid, id, 'company' from public.roles where company_id = v_co and code in ('COMPANY_ADMIN', 'STAKEHOLDER', 'DISCOVERY_LEAD');
  end if;

  -- discovery campaign: 100 conversations
  insert into public.interview_campaigns (company_id, code, name, purpose, owner_membership_id, status, starts_on, due_on, interview_mode, question_scopes, purpose_kind)
  values (v_co, 'DISCOVERY-2026', 'Understanding our work — discovery conversations', 'Every colleague explains how their work really happens; the AI turns it into process maps.',
          v_beh, 'active', (v_start)::date, (v_now + interval '14 days')::date, 'discovery', '{}', 'standard') returning id into v_camp;
  if v_owner_mid is not null then   -- the demo administrator is not interviewed (no "start your conversation" prompt for them)
    insert into public.interview_assignments (company_id, campaign_id, respondent_membership_id, department_id, status, created_at)
    values (v_co, v_camp, v_owner_mid, d_ids[1], 'cancelled', v_start);
  end if;

  for i in 1 .. array_length(v_mids, 1) loop
    v_dc := v_mdept[i]; v_mid := v_mids[i];
    v_status := case when i % 33 = 0 then 'invited' when i % 10 in (3, 7) then 'in_progress' when i % 17 = 5 then 'invited' else 'completed' end;
    v_t := v_start + ((i * 13) % 42 || ' days')::interval + ((i * 7) % 9 || ' hours')::interval;
    insert into public.interview_assignments (company_id, campaign_id, respondent_membership_id, department_id, status, created_at)
    values (v_co, v_camp, v_mid, (select primary_department_id from public.memberships where id = v_mid), v_status, v_start) returning id into v_asg;
    continue when v_status = 'invited';
    insert into public.interview_sessions (company_id, assignment_id, status, started_at, submitted_at, respondent_confirmed_at)
    values (v_co, v_asg, case when v_status = 'completed' then 'submitted' else 'in_progress' end, v_t,
            case when v_status = 'completed' then v_t + interval '50 minutes' end, case when v_status = 'completed' then v_t + interval '50 minutes' end)
    returning id into v_ses;
    -- the person's processes (2-3 from their department's library; leadership/others fall back to OPS library)
    v_p := coalesce(lib -> v_dc, lib -> 'OPS');
    insert into public.discovery_profiles (company_id, session_id, membership_id, profile, responsibilities, inventory_confirmed, stage, updated_at)
    values (v_co, v_ses, v_mid, jsonb_build_object('role', (select job_title from public.memberships where id = v_mid), 'experience_years', 1 + i % 12, 'team_size', case when i % 5 = 0 then 6 else 0 end),
            jsonb_build_array('Deliver ' || lower(v_p -> 0 ->> 0) || ' to standard', 'Keep records complete and on time', 'Raise issues early'),
            v_status = 'completed', case when v_status = 'completed' then 'wrap_up' else 'process_deep_dive' end, v_t + interval '50 minutes');
    for k in 0 .. least(1 + i % 2, jsonb_array_length(v_p) - 1) loop
      v_proc := v_p -> ((i + k) % jsonb_array_length(v_p));
      v_nodes := jsonb_build_array(jsonb_build_object('id', 's0', 'type', 'start', 'label', 'Start'))
        || (select jsonb_agg(jsonb_build_object('id', 's' || x, 'type', case when x = 2 then 'decision' when x = 4 then 'handover' else 'step' end,
               'label', v_proc ->> (1 + x), 'actor', case when x = 4 then 'Next team' else 'Me' end, 'system', v_proc ->> 7)) from generate_series(1, 5) x)
        || jsonb_build_array(jsonb_build_object('id', 's6', 'type', 'end', 'label', 'Done'));
      v_edges := (select jsonb_agg(jsonb_build_object('from', 's' || x, 'to', 's' || (x + 1)) || case when x = 2 then jsonb_build_object('label', 'ok') else '{}'::jsonb end) from generate_series(0, 5) x)
        || jsonb_build_array(jsonb_build_object('from', 's2', 'to', 's1', 'label', 'missing info'));
      insert into public.discovered_processes (company_id, session_id, membership_id, process_key, name, purpose, involvement, owner_text, importance, frequency, volume,
                                               status, completeness, coverage, flow, flow_version, created_at, updated_at)
      values (v_co, v_ses, v_mid, lower(regexp_replace(v_proc ->> 0, '[^A-Za-z]+', '_', 'g')), v_proc ->> 0, v_proc ->> 1,
              (array['execute','manage','review','mixed'])[1 + (i + k) % 4], case when k = 0 then 'Me' else 'My team lead' end,
              (array['high','medium','high','low'])[1 + (i + k) % 4], (array['Daily','Daily','Weekly','Monthly'])[1 + (i * 3 + k) % 4], (20 + (i * 17) % 180) || ' per day',
              case when v_status = 'completed' then 'sufficient' else 'in_discovery' end, case when v_status = 'completed' then 80 + (i * 7 + k) % 21 else 35 + (i * 5) % 40 end,
              jsonb_build_object('purpose','sufficient','trigger','sufficient','activities','sufficient','roles','sufficient','systems', case when v_status = 'completed' then 'sufficient' else 'partial' end,
                                 'tat','partial','exceptions', case when v_status = 'completed' then 'sufficient' else 'not_started' end,'controls','partial','dependencies','sufficient','performance','partial'),
              jsonb_build_object('nodes', v_nodes, 'edges', v_edges), 1 + i % 5, v_t + interval '20 minutes', v_t + interval '50 minutes')
      on conflict do nothing;
      v_dps := v_dps + 1;
    end loop;
    -- the conversation: AI question -> person's answer
    for k in 1 .. case when v_status = 'completed' then 10 else 4 + i % 4 end loop
      v_proc := v_p -> (i % jsonb_array_length(v_p));
      insert into public.ai_runs (company_id, capability, provider, model, prompt_version_id, data_classification, status, schema_valid, requested_by_membership_id, created_at, finished_at)
      values (v_co, 'interview_followup', 'groq_free', 'llama-3.3-70b-versatile', v_prompt, 'internal', 'succeeded', true, v_mid,
              v_t + (k * 4 || ' minutes')::interval - interval '3 seconds', v_t + (k * 4 || ' minutes')::interval) returning id into v_run;
      insert into public.interview_questions (company_id, session_id, seq, field_key, question_text, rationale, generated_by, prompt_version_id, created_at, suggestions, ai_run_id)
      values (v_co, v_ses, k, 'ai.discovery.' || qtopics[k],
        case qtopics[k]
          when 'role' then 'To start, could you tell me about your role and what a normal working day looks like for you?'
          when 'responsibilities' then 'What are the main things you are responsible for — the results people count on you for?'
          when 'process_inventory' then 'Which pieces of work do you handle again and again? Just list them in your own words.'
          when 'process_steps' then 'Let''s take “' || (v_proc ->> 0) || '”. Walk me through what happens, step by step, from the moment it starts.'
          when 'systems' then 'Which systems, sheets or apps do you use for this?'
          when 'handover' then 'Who do you hand the work over to when your part is done, and how do they know it is ready?'
          when 'exceptions' then 'What usually goes wrong, and what do you do when it does?'
          when 'controls' then 'How do you or your manager check that it was done right?'
          when 'pain_points' then 'What slows you down the most in this work?'
          else 'If you could change one thing to make this work easier or better, what would it be?' end,
        'Helps map the process accurately', 'ai', v_prompt, v_t + (k * 4 || ' minutes')::interval,
        case qtopics[k] when 'systems' then array[v_proc ->> 7, 'Excel sheet', 'E-mail'] when 'pain_points' then array['Missing documents', 'Waiting for others', 'Manual data entry'] else '{}'::text[] end, v_run)
      returning id into v_q;
      insert into public.interview_answers (company_id, question_id, answer_kind, answer_text, knowledge_basis, answered_by_membership_id, answered_at)
      values (v_co, v_q, 'answer',
        case qtopics[k]
          when 'role' then 'I work as ' || lower((select job_title from public.memberships where id = v_mid)) || '. My day starts with checking what came in overnight, then I plan the day and follow up on anything pending.'
          when 'responsibilities' then 'Mainly ' || lower(v_proc ->> 0) || ', keeping the records complete, and making sure clients get what they need within the agreed time.'
          when 'process_inventory' then (select string_agg(x ->> 0, ', ') from jsonb_array_elements(v_p) x) || ' — those are the regular ones.'
          when 'process_steps' then 'First we ' || lower(v_proc ->> 2) || '. Then we ' || lower(v_proc ->> 3) || '. If something is missing we go back. After that we ' || lower(v_proc ->> 4) || ', then ' || lower(v_proc ->> 5) || ' and finally ' || lower(v_proc ->> 6) || '.'
          when 'systems' then 'Mostly the ' || (v_proc ->> 7) || ', plus an Excel tracker that we maintain ourselves, and e-mail for client communication.'
          when 'handover' then 'Once my part is done I update the status and the next team picks it up. Sometimes I also call them if it is urgent.'
          when 'exceptions' then (array['Documents are often incomplete, so we chase the applicant again.','The address is not traceable — we mark it and inform the client.','The client changes the format at the last minute.','Two people get the same case by mistake.'])[1 + (i + k) % 4]
          when 'controls' then (array['My team lead checks a sample every day.','Quality picks random cases each week.','There is no formal check today — we rely on experience.','The system blocks submission if fields are empty.'])[1 + i % 4]
          when 'pain_points' then (array['Re-entering the same data in two systems.','Waiting for documents from the client.','No clear owner when cases are reassigned.','Manual TAT tracking in Excel.'])[1 + (i * 3) % 4]
          else (array['One shared tracker instead of three sheets.','Automatic reminders before TAT breach.','A checklist for every case type.','Clear escalation contacts on every client.'])[1 + (i * 5) % 4] end,
        'direct', v_mid, v_t + (k * 4 + 2 || ' minutes')::interval);
      v_answers := v_answers + 1;
    end loop;
  end loop;

  -- process register: give the standard catalogue an owner department and realistic statuses
  for r in select f.id, f.code from public.catalogue_functions f where f.company_id = v_co loop
    update public.catalogue_functions set department_id = d_ids[array_position(d_code,
      case r.code when 'GOV' then 'LEAD' when 'OPS' then 'OPS' when 'BACKOFF' then 'OPS' when 'MSME' then 'OPS' when 'BD' then 'CS' when 'CRM' then 'CS'
                  when 'FIELD' then 'FLD' when 'VENDOR' then 'FLD' when 'FIN' then 'FIN' when 'HR' then 'HR' when 'ADMIN' then 'HR'
                  when 'LEGAL' then 'QC' when 'QBE' then 'QC' when 'RISK' then 'QC' when 'IT' then 'TECH' when 'INFOSEC' then 'TECH' else 'OPS' end)] where id = r.id;
  end loop;
  n := 0;
  for v_item in select ci.id, ci.kind, ci.title, f.department_id from public.catalogue_items ci join public.catalogue_functions f on f.id = ci.function_id
                 where ci.company_id = v_co order by ci.code loop
    n := n + 1; v_pick := (n * 37) % 100;
    update public.catalogue_items set status = 'active',
      process_status = case when v_pick < 68 then 'performed' when v_pick < 86 then 'partial' when v_pick < 94 then 'unknown' else 'not_performed' end,
      document_status = case when v_pick % 10 in (0, 1) then 'approved' when v_pick % 10 = 2 then 'in_review' when v_pick % 10 = 3 then 'draft'
                             when v_pick % 10 in (4, 5) then 'exists_outside' when v_pick % 10 = 6 then 'outdated' else 'none' end,
      classification = case when v_item.kind = 'policy' then 'mandatory' when v_pick % 3 = 0 then 'required' else 'recommended' end,
      basis = case when v_item.kind = 'policy' then 'regulation' else 'operational_need' end,
      classification_reason = case when v_item.kind = 'policy' then 'Required by client agreements and applicable regulation' else 'Needed to run the service consistently' end,
      classified_by = v_beh, classified_at = v_start + interval '15 days',
      status_updated_at = v_start + ((n % 50) || ' days')::interval,
      discovered_process_id = (select dp.id from public.discovered_processes dp where dp.company_id = v_co and lower(dp.name) = lower(v_item.title) limit 1)
     where id = v_item.id;
    if v_item.kind = 'process' and v_pick < 40 then
      insert into public.process_validations (company_id, item_id, decision, note, open_items, snapshot, decided_by, decided_at)
      values (v_co, v_item.id, case when v_pick % 7 = 0 then 'changes_requested' else 'validated' end,
              case when v_pick % 7 = 0 then 'Exception handling for missing documents is not captured yet.' end, case when v_pick % 7 = 0 then 1 else 0 end,
              jsonb_build_object('title', v_item.title), coalesce(v_head[array_position(d_ids, v_item.department_id)], v_coo), v_start + ((20 + n % 30) || ' days')::interval);
    end if;
  end loop;

  -- expert board: approved, awaiting and shared documents, with the board's discussion
  for i in 1 .. 12 loop
    insert into public.board_cases (company_id, kind, doc_type, title, brief, classification, status, created_by_membership_id, decided_by_membership_id, decided_at, decision_note, created_at, next_step)
    values (v_co, case when i in (11, 12) then 'improvement_review' else 'document_draft' end,
      case when i in (11, 12) then null else (array['policy','sop','sop','policy','sop','charter','policy','sop','policy','sop'])[i] end,
      (array['Customer Complaints Handling Policy','SOP — Case Allocation and Reassignment','SOP — Residence and Office Verification','Data Privacy and Personal Data Handling Policy',
             'SOP — Quality Checks and Rejection','Service Quality Charter','Field Partner Payment Policy','SOP — TAT Monitoring and Escalation','Record Retention Policy','SOP — Client Onboarding',
             'Improvement review — reduce report rework','Improvement review — faster partner payouts'])[i],
      'Drafted from the discovery conversations and validated process maps of the teams involved.',
      (array['public','internal','internal','public','internal','public','internal','internal','internal','internal','internal','internal'])[i],
      case when i <= 7 or i = 11 then 'approved' when i in (8, 9, 12) then 'awaiting_approval' else 'rejected' end, v_beh,
      case when i <= 7 or i in (10, 11) then v_ceo end, case when i <= 7 or i in (10, 11) then v_start + ((30 + i * 2) || ' days')::interval end,
      case when i = 10 then 'Please align with the new client onboarding checklist first.' end, v_start + ((24 + i * 2) || ' days')::interval, 5)
    returning id into v_case;
    insert into public.board_outputs (company_id, case_id, version, title, body_md, audit_verdict, audit_notes, created_at)
    select v_co, v_case, 1, bc.title,
      '## 1. Purpose' || E'\n' || 'This document sets out how Velora (a fictional demo company) handles “' || bc.title || '” so that every team works the same way and clients get a consistent, auditable service.' || E'\n\n' ||
      '## 2. Scope' || E'\n' || 'Applies to all branches, employees and field partners involved in this work.' || E'\n\n' ||
      '## 3. Roles' || E'\n' || '| Role | Responsibility |' || E'\n' || '|---|---|' || E'\n' || '| Process owner | Keeps this document current and trains the team |' || E'\n' ||
      '| Team lead | Checks daily that the steps are followed |' || E'\n' || '| Quality | Samples cases weekly and reports deviations |' || E'\n\n' ||
      '## 4. Procedure' || E'\n' || '1. Receive and log the request the same working day.' || E'\n' || '2. Check that all mandatory information is present; if not, request it within **4 working hours**.' || E'\n' ||
      '3. Carry out the work as per the validated process map.' || E'\n' || '4. Record evidence and decisions in the case system.' || E'\n' || '5. Hand over to the next team and update the status.' || E'\n\n' ||
      '## 5. Service levels' || E'\n' || '- Acknowledgement: within 1 working day' || E'\n' || '- Resolution: within 2 working days (high severity: same day)' || E'\n\n' ||
      '## 6. Records and review' || E'\n' || 'Records are kept for the period required by the client agreement. This document is reviewed every 12 months or after any major change.',
      'pass', 'Consistent with the validated process maps; no unsupported claims.', bc.created_at + interval '2 days'
      from public.board_cases bc where bc.id = v_case;
    k := 0;
    for v_role in select ar.id, ar.code, t.code team from public.agent_roles ar join public.agent_teams t on t.id = ar.team_id
                   where ar.company_id = v_co and ar.status = 'active' order by t.sort_order, ar.code limit 5 loop
      k := k + 1;
      insert into public.board_turns (company_id, case_id, seq, step, role_id, role_code, team_code, kind, summary, content, key_points, verdict, created_at)
      values (v_co, v_case, k, k, v_role.id, v_role.code, v_role.team, (array['proposal','critique','critique','consolidation','audit'])[k],
        (array['Proposed a structure based on the validated process maps.','Asked for a clear escalation path and timelines.','Flagged data-privacy wording for personal data.',
               'Merged the comments into one clean draft.','Checked the draft against the sources — passes.'])[k],
        (array['I propose six sections: purpose, scope, roles, procedure, service levels, records. Each step comes from the teams'' own description.',
               'The procedure needs explicit timelines and an owner for escalations, otherwise breaches will not be visible.',
               'Wherever applicant data appears we should say who may see it and how long it is kept.',
               'All comments are incorporated: timelines in section 5, escalation owner in section 3, data handling in section 6.',
               'Every statement traces back to an interview or a validated process; no unsupported claims found.'])[k],
        array['Grounded in the teams'' own words', 'Clear owners'], case when k = 5 then 'pass' end, (select created_at from public.board_cases where id = v_case) + (k || ' hours')::interval);
    end loop;
  end loop;
  -- share three public documents on the website, two internal ones through the API
  insert into public.document_releases (company_id, case_id, slug, public_embed, released_by_membership_id, released_at, calls_total)
  select v_co, bc.id, lower(regexp_replace(regexp_replace(bc.title, '^SOP — ', 'sop-'), '[^A-Za-z0-9]+', '-', 'g')), bc.classification = 'public', v_ceo,
         bc.decided_at + interval '1 day', 40 + (row_number() over ()) * 23
    from public.board_cases bc where bc.company_id = v_co and bc.status = 'approved' and bc.kind = 'document_draft' and bc.title not like '%Partner Payment%';
  update public.catalogue_items set document_status = 'approved' where company_id = v_co and title ilike any (array['%Grievance%','%Data Privacy%','%Case allocation%','%Quality checks%']);

  -- tasks & tickets with short threads (8 weeks)
  for i in 1 .. 120 loop
    v_mid := v_mids[1 + (i * 7) % array_length(v_mids, 1)]; v_t := v_start + ((i * 11) % 54 || ' days')::interval + ((i * 5) % 8 || ' hours')::interval;
    v_status := case when i % 10 < 6 then 'resolved' when i % 10 = 6 then 'closed' when i % 10 = 7 then 'in_progress' when i % 10 = 8 then 'waiting' else 'open' end;
    if v_status not in ('resolved', 'closed') then v_t := v_now - ((i * 3) % 13 || ' days')::interval - ((i * 5) % 8 || ' hours')::interval; end if;   -- open work is recent
    insert into public.tickets (company_id, kind, title, description, priority, status, requester_membership_id, assignee_membership_id, assignee_department_id, due_at,
                                related_label, resolution, resolved_at, escalated_at, escalated_to_membership_id, reminder_count, created_at, updated_at)
    values (v_co, (array['action','action','review','improvement','question','risk_action','approval','action'])[1 + i % 8],
      (array['Update the pincode allocation sheet','Review rejected report batch','Confirm new client SLA format','Fix duplicate case allocation','Share field evidence checklist',
             'Close pending partner payouts','Train new joiners on the case system','Map the rework process','Reply to client escalation','Check data masking in reports',
             'Prepare monthly MIS for client review','Validate the TAT monitoring map'])[1 + i % 12] || ' #' || i,
      'Raised from the discovery findings (demo).', (array['normal','high','normal','low','critical','normal'])[1 + i % 6], v_status,
      v_mids[1 + (i * 3) % array_length(v_mids, 1)], v_mid, (select primary_department_id from public.memberships where id = v_mid),
      v_t + ((6 + i % 9) || ' days')::interval, case when i % 4 = 0 then 'Process: report preparation' end,
      case when v_status in ('resolved', 'closed') then (array['Done and shared with the team.','Sheet updated; owners informed.','Checklist published on the intranet.','Client agreed; SLA updated.'])[1 + i % 4] end,
      case when v_status in ('resolved', 'closed') then v_t + ((1 + i % 5) || ' days')::interval end,
      case when v_status = 'open' and i % 3 = 0 then v_t + interval '6 days' end, case when v_status = 'open' and i % 3 = 0 then v_head[array_position(d_code, v_mdept[1 + (i * 7) % array_length(v_mids, 1)])] end,
      case when v_status in ('open', 'waiting') then i % 4 else 0 end, v_t, v_t)
    returning id into v_tkt;
    insert into public.ticket_comments (company_id, ticket_id, author_membership_id, body, kind, created_at)
    values (v_co, v_tkt, v_mid, (array['Working on it — will update by tomorrow.','Need one clarification from the client first.','Done, please check.','Started; shared a draft with the team.'])[1 + i % 4], 'comment', v_t + interval '5 hours');
    v_tickets := v_tickets + 1;
  end loop;
  -- two support requests to the platform team
  insert into public.tickets (company_id, kind, title, description, priority, status, requester_membership_id, resolution, resolved_at, created_at, updated_at, to_platform)
  values (v_co, 'support', 'How do I export the process register?', 'Demo request.', 'normal', 'resolved', v_beh, 'Use Reports → Process register → Download CSV.', v_now - interval '9 days', v_now - interval '10 days', v_now - interval '9 days', true),
         (v_co, 'support', 'Can we add our logo to shared documents?', 'Demo request.', 'low', 'open', v_ceo, null, null, v_now - interval '2 days', v_now - interval '2 days', true);

  -- colleague questions (clarifications)
  for i in 1 .. 24 loop
    k := 1 + (i * 5) % array_length(v_mids, 1); j := 1 + (i * 9 + 3) % array_length(v_mids, 1);
    insert into public.clarification_tasks (company_id, requester_membership_id, requesting_department_id, assignee_department_id, assignee_membership_id, question_text, priority, due_at, status, created_at)
    values (v_co, v_mids[k], (select primary_department_id from public.memberships where id = v_mids[k]), (select primary_department_id from public.memberships where id = v_mids[j]), v_mids[j],
      (array['Who approves a reassignment when the investigator declines a case?','What is the cut-off time for same-day client submission?','Which documents are mandatory for an office verification?',
             'How do we treat a case where the address is not traceable?','Who updates the client when a TAT breach is expected?','Where is the latest partner rate card kept?'])[1 + i % 6],
      (array['normal','high','normal','low'])[1 + i % 4], v_now + ((i % 5) - 2 || ' days')::interval, 'open', v_now - ((30 - i) || ' days')::interval)
    returning id into v_task;
    if i % 3 <> 0 then
      insert into public.clarification_responses (company_id, task_id, responder_membership_id, response_text, created_at)
      values (v_co, v_task, v_mids[j], (array['The zonal field manager approves it in the allocation sheet.','5 pm for submissions; after that it goes next day.','Appointment letter, ID card and a photo at the desk.',
              'Mark it untraceable with two neighbour statements and inform the client.','The team lead, by e-mail, before noon.','In the finance shared drive, folder “Partners 2026”.'])[1 + i % 6], v_now - ((29 - i) || ' days')::interval);
    end if;
  end loop;

  -- leadership blueprint: confirmed statements, CTQs, open questions
  insert into public.blueprint_entries (company_id, section, statement, source_kind, source_refs, status, proposed_by, decided_by, decided_at, created_at)
  select v_co, s, t, 'manual', '[]'::jsonb, 'confirmed', v_beh, v_ceo, v_start + interval '20 days', v_start + interval '18 days'
    from (values ('identity', 'Velora is a (fictional) verification and risk-assurance company serving banks and lenders across India.'),
                 ('purpose', 'We help lenders decide with confidence by verifying people, places and documents quickly and honestly.'),
                 ('services', 'Residence, office and business verification; document checks; field investigation; MSME due diligence.'),
                 ('customers', 'Banks, NBFCs and fintech lenders; their credit and risk teams.'),
                 ('customer_expectations', 'Accurate reports within the agreed turnaround time, with evidence that stands up to audit.'),
                 ('objectives', 'Cut report rework by half and bring 95% of cases inside TAT within this year.'),
                 ('challenges', 'Manual trackers, inconsistent field evidence and knowledge held by a few experienced people.'),
                 ('risk_appetite', 'Zero tolerance for data-privacy breaches and fabricated evidence; moderate appetite for process experiments.'),
                 ('voc', 'Clients want fewer follow-up calls and one point of contact for escalations.'),
                 ('voe', 'Employees want clear ownership when cases are reassigned and fewer duplicate data entries.')) v(s, t);
  insert into public.ctq_items (company_id, code, name, voice, expectation, measure, unit, direction, baseline, target_value, target_text, status, source_kind, source_refs,
                                proposed_by, target_requested_by, target_requested_at, approved_by, approved_at, created_at, updated_at)
  values (v_co, 'CTQ-01', 'Cases delivered within TAT', 'voc', 'Reports on time', 'Share of cases delivered within the agreed TAT', '%', 'higher_better', '82%', 95, null, 'approved', 'manual', '[]', v_beh, v_coo, v_start + interval '22 days', v_ceo, v_start + interval '23 days', v_start, v_now),
         (v_co, 'CTQ-02', 'Report rework rate', 'voc', 'Right first time', 'Share of reports returned by the client for correction', '%', 'lower_better', '9%', 4, null, 'approved', 'manual', '[]', v_beh, v_coo, v_start + interval '22 days', v_ceo, v_start + interval '23 days', v_start, v_now),
         (v_co, 'CTQ-03', 'Partner payout cycle', 'vob', 'Partners paid on time', 'Days from visit completion to partner payment', 'days', 'lower_better', '21 days', 10, null, 'pending_approval', 'manual', '[]', v_beh, v_cfo, v_now - interval '3 days', null, null, v_start, v_now),
         (v_co, 'CTQ-04', 'Escalation response time', 'voc', 'Fast answers', 'Hours to first response on a client escalation', 'hours', 'lower_better', '9 hours', 4, null, 'approved', 'manual', '[]', v_beh, v_coo, v_start + interval '22 days', v_ceo, v_start + interval '23 days', v_start, v_now);
  insert into public.blueprint_open_questions (company_id, section, question, status, assigned_to, answer, answered_by, answered_at, created_at)
  values (v_co, 'future_direction', 'Which new client segment should we prioritise next year?', 'open', v_ceo, null, null, null, v_now - interval '12 days'),
         (v_co, 'partners', 'Should field partners be paid weekly instead of monthly?', 'open', v_cfo, null, null, null, v_now - interval '6 days'),
         (v_co, 'technology', 'Do we replace the Excel trackers with the case system this year?', 'answered', v_coo, 'Yes — phase 1 by March, starting with allocation and TAT tracking.', v_coo, v_now - interval '15 days', v_now - interval '20 days');

  -- projects with milestones
  insert into public.projects (company_id, code, name, objective, manager_membership_id, sponsor_membership_id, department_ids, starts_on, target_end_on, status, created_by_membership_id, created_at)
  values (v_co, 'OPS-W1', 'Operations discovery & SOP wave 1', 'Map and document every verification and field process, and publish the key SOPs.', v_head[2], v_coo,
          array[d_ids[2], d_ids[3], d_ids[4]], (v_start)::date, (v_now + interval '30 days')::date, 'active', v_beh, v_start) returning id into v_proj;
  insert into public.project_milestones (company_id, project_id, title, due_on, owner_membership_id, done_at, sort_order) values
    (v_co, v_proj, 'Discovery conversations launched', (v_start + interval '3 days')::date, v_beh, v_start + interval '3 days', 10),
    (v_co, v_proj, '80% of operations interviews completed', (v_start + interval '35 days')::date, v_head[2], v_start + interval '38 days', 20),
    (v_co, v_proj, 'Process maps validated by owners', (v_now - interval '5 days')::date, v_head[4], null, 30),
    (v_co, v_proj, 'Five core SOPs approved', (v_now + interval '10 days')::date, v_beh, null, 40),
    (v_co, v_proj, 'SOPs published to the intranet', (v_now + interval '25 days')::date, v_head[8], null, 50);
  insert into public.projects (company_id, code, name, objective, manager_membership_id, sponsor_membership_id, department_ids, starts_on, target_end_on, status, created_by_membership_id, created_at)
  values (v_co, 'POL-26', 'Company-wide policy refresh', 'Bring all mandatory policies up to date and get them approved.', v_beh, v_ceo, '{}', (v_now - interval '20 days')::date, (v_now + interval '75 days')::date, 'active', v_ceo, v_now - interval '20 days')
  returning id into v_proj;
  insert into public.project_milestones (company_id, project_id, title, due_on, owner_membership_id, done_at, sort_order) values
    (v_co, v_proj, 'Policy gap list agreed', (v_now - interval '10 days')::date, v_beh, v_now - interval '11 days', 10),
    (v_co, v_proj, 'Data privacy policy approved', (v_now + interval '5 days')::date, v_head[4], v_now - interval '2 days', 20),
    (v_co, v_proj, 'All mandatory policies approved', (v_now + interval '60 days')::date, v_ceo, null, 30);

  -- AI usage history (figures only)
  insert into public.ai_runs (company_id, capability, provider, model, prompt_version_id, data_classification, status, schema_valid, created_at, finished_at)
  select v_co, case when g % 3 = 0 then 'board_turn' else 'interview_followup' end, 'groq_free', 'llama-3.3-70b-versatile', case when g % 3 = 0 then v_board_prompt else v_prompt end,
         'internal', case when g % 37 = 0 then 'failed' else 'succeeded' end, g % 37 <> 0, v_start + ((g * 97) % (56 * 24) || ' hours')::interval, v_start + ((g * 97) % (56 * 24) || ' hours')::interval + interval '2 seconds'
    from generate_series(1, 160) g;

  -- billing: Growth package with 10% discount; September paid, October issued (own DEMO series)
  select id into v_plan from public.billing_plans where code = 'GROWTH';
  if v_plan is not null then
    insert into public.company_subscriptions (company_id, plan_id, starts_on, discount_pct, note) values (v_co, v_plan, date '2026-09-01', 10, 'Demo subscription');
    insert into public.company_billing_profiles (company_id, legal_name, address, state_code, billing_email) values (v_co, 'Velora Assurance Services (Demo)', 'Pune, Maharashtra (fictional)', '27', 'accounts@velora-demo.invalid');
    insert into public.invoices (company_id, number, period_start, period_end, status, proforma, plan_snapshot, usage, lines, subtotal, discount, taxable, cgst, sgst, igst, total,
                                 supplier, recipient, issued_at, due_on, paid_at)
    select v_co, upper(p_code) || '/26-27/' || lpad(m::text, 4, '0'), make_date(2026, 8 + m, 1), (make_date(2026, 8 + m, 1) + interval '1 month - 1 day')::date,
           case when m = 1 then 'paid' else 'issued' end, true, to_jsonb(p) || '{"discount_pct": 10}', jsonb_build_object('active_people', 96 + m, 'ai_runs', 6200 + m * 900, 'documents_approved', 3),
           jsonb_build_array(jsonb_build_object('label', 'Growth package — monthly fee', 'qty', 1, 'rate', 45000, 'amount', 45000)),
           45000, 4500, 40500, 3645, 3645, 0, 47790, jsonb_build_object('legal_name', 'Demo supplier'), jsonb_build_object('legal_name', 'Velora Assurance Services (Demo)', 'state_code', '27'),
           make_date(2026, 9 + m, 2), make_date(2026, 9 + m, 17), case when m = 1 then make_date(2026, 9 + m, 12) end
      from generate_series(1, 2) m, public.billing_plans p where p.id = v_plan;
  end if;

  -- a few notifications for the demo administrator
  if v_owner_mid is not null then
    insert into public.notifications (company_id, recipient_membership_id, kind, title, object_type, dedupe_key, created_at)
    values (v_co, v_owner_mid, 'digest', 'Welcome to the Velora demo — open the dashboard to see the whole engagement', 'digest', 'demo:welcome', v_now),
           (v_co, v_owner_mid, 'digest', '3 SOPs are waiting for approval on the expert board', 'digest', 'demo:board', v_now - interval '1 hour');
  end if;

  return jsonb_build_object('company_id', v_co, 'code', upper(p_code), 'people', array_length(v_mids, 1), 'answers', v_answers, 'processes_discovered', v_dps,
                            'tickets', v_tickets, 'owner_member', v_owner_mid is not null);
end $$;
revoke all on function private.build_demo_company(text, text, uuid, text) from public, anon, authenticated;
