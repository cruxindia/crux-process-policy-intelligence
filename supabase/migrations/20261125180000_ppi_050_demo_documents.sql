-- PPI-050: the demo company shows the document-first flow (SOW 12G Q9). Fictional content only (Velora Assurance Services):
-- the checklist adopted, ~40 brought-in files (rule documents, records, personal records), analysed rule documents with
-- as-is processes and flowcharts, findings by department, missing documents and duplicates, and named reviewers with some
-- points already answered. Runs only for companies marked is_demo; does nothing if documents already exist.

create or replace function private.build_demo_documents(p_company uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_ver uuid; v_admin uuid; d record; v_doc uuid; v_an uuid; n_docs int := 0;
  rules jsonb := '[
   {"f":"Leave and Attendance Policy v3.docx","dir":"HR/Policies","dept":"HR","type":"policy","match":"%leave%","proc":"Leave application and approval",
    "steps":["Employee applies in the leave register","Reporting manager reviews","Decision: within balance?","HR updates attendance","Salary team informed"],
    "gaps":[["no_approval","high","Leave above five days has no second approver or limit."],["missing_exception","medium","Unplanned leave and absconding are not covered."]],
    "risks":[["Leave balances differ between the register and payroll","Monthly reconciliation of the register with payroll, signed by HR"]],
    "q":["Who approves leave longer than a week today, and is it written anywhere?"]},
   {"f":"Travel and Expense Policy 2025.docx","dir":"Finance","dept":"FIN","type":"policy","match":"%travel%","proc":"Travel claim settlement",
    "steps":["Employee submits claim with bills","Manager approves","Accounts checks bills","Decision: within limits?","Payment in next cycle"],
    "gaps":[["missing_control","high","No check for duplicate bills across claims."],["missing_sla","low","The payment time after approval is not stated."]],
    "risks":[["Inflated or repeated claims","Bill number register and sample audit of 5% of claims each month"]],
    "q":["What are the hotel and daily allowance limits per grade?"]},
   {"f":"Travel and Expense Policy - revised.docx","dir":"Finance/Archive","dept":"FIN","type":"policy","match":null,"proc":null,"steps":[],"gaps":[["conflict","medium","Limits differ from the 2025 Travel and Expense Policy."]],"risks":[],"q":[]},
   {"f":"SOP - Field Verification Visit.docx","dir":"Operations/SOPs","dept":"OPS","type":"sop","match":"%verification%","proc":"Field verification visit",
    "steps":["Case allocated to field executive","Executive visits the address","Photos and geo-tag captured","Decision: person met?","Report uploaded","Quality check"],
    "gaps":[["undefined_owner","high","No role is named as accountable for missed turnaround times."],["missing_escalation","medium","What to do when the address cannot be found is not stated."]],
    "risks":[["Reports filed without a real visit","Geo-tag and time-stamp check on every report; surprise re-visits on a sample"]],
    "q":["How many visits per day is a field executive expected to complete?"]},
   {"f":"Quality Check SOP.docx","dir":"Operations/SOPs","dept":"OPS","type":"sop","match":"%quality%","proc":"Report quality check",
    "steps":["Report received","Checker reviews against checklist","Decision: complete and consistent?","Return to executive","Release to client"],
    "gaps":[["ambiguous_step","medium","The checklist used by the checker is referred to but not attached."]],
    "risks":[["Wrong report released to a bank client","Four-eyes release for negative reports"]],"q":["Who signs off negative reports before release?"]},
   {"f":"Client Escalation Procedure.docx","dir":"Client Service","dept":"CS","type":"procedure","match":"%complaint%","proc":"Client complaint handling",
    "steps":["Complaint received by email","Logged in tracker","Branch asked for explanation","Decision: valid complaint?","Reply to client"],
    "gaps":[["missing_sla","high","No response time is committed to clients."]],
    "risks":[["Repeat complaints lead to empanelment loss","Root-cause review of every repeat complaint in the monthly MIS"]],"q":["Which clients have contractual complaint response times?"]},
   {"f":"Recruitment Policy.docx","dir":"HR/Policies","dept":"HR","type":"policy","match":"%recruit%","proc":"Hiring a new employee",
    "steps":["Manpower request raised","HR sources candidates","Interview","Decision: selected?","Offer and appointment letter","Joining formalities"],
    "gaps":[["missing_control","medium","Background verification of new hires is not required."]],
    "risks":[["Hiring without approved position","Approved headcount list checked before every offer"]],"q":["Who approves a new position?"]},
   {"f":"Information Security Guidelines.docx","dir":"IT","dept":"IT","type":"guideline","match":"%information security%","proc":null,"steps":[],
    "gaps":[["missing_section","high","No rule for access removal when someone leaves."],["no_review_date","low","No review date."]],
    "risks":[["Leavers keep access to client data","Exit checklist with IT sign-off within 24 hours"]],"q":["Who removes system access when someone leaves?"]},
   {"f":"Vendor Onboarding Checklist.xlsx","dir":"Admin","dept":"PROC","type":"form","match":"%vendor%","proc":null,"steps":[],
    "gaps":[["missing_control","medium","No conflict-of-interest declaration from vendors."]],"risks":[],"q":["Which vendors were onboarded without this checklist?"]},
   {"f":"KRA - Field Executive.docx","dir":"HR/KRA","dept":"HR","type":"role","match":null,"proc":null,"steps":[],
    "gaps":[["missing_section","medium","Targets are listed without how they are measured."]],"risks":[],"q":[]},
   {"f":"Code of Conduct.docx","dir":"HR/Policies","dept":"HR","type":"policy","match":"%conduct%","proc":null,"steps":[],"gaps":[["no_approval","medium","Not signed by the board or the managing director."]],"risks":[],"q":[]},
   {"f":"Partner Branch Agreement Template.docx","dir":"Partners","dept":"PM","type":"agreement_template","match":"%partner%","proc":null,"steps":[],
    "gaps":[["missing_section","high","No audit right over partner branches."],["missing_section","medium","Data protection duties of the partner are missing."]],
    "risks":[["A partner shares client data with a competitor","Confidentiality and audit clauses, quarterly partner audit"]],"q":["How many partner branches work without a signed agreement?"]}
  ]'::jsonb;
  records text[] := array['Appointment letter - Employee 014.docx','Appointment letter - Employee 027.docx','Appointment letter - Employee 041.docx',
    'Offer letter - Employee 052.docx','Board resolution - bank account.docx','Minutes - Management review Q2.docx','Undertaking - confidentiality - Employee 014.docx',
    'Undertaking - confidentiality - Employee 027.docx','Vendor invoice - stationery.pdf','Client letter - empanelment renewal.docx','Branch visit photo 01.jpg',
    'Branch visit photo 02.jpg','Monthly MIS - October.xlsx','Partner agreement - Nashik (signed).pdf','Partner agreement - Nagpur (signed).pdf',
    'Request letter - address change.docx','Training attendance - induction.xlsx','Asset list - Pune office.xlsx'];
  sensitive text[] := array['Warning letter - Employee 033.docx','Salary revision - Employee 019.docx','Aadhar Front - Employee 052.jpeg',
    'Legal notice reply - vendor dispute.docx','Resignation - Employee 008.docx','Loan undertaking - Employee 019.docx'];
  r jsonb; g jsonb; k int; v_flow jsonb; v_reg uuid; v_cnt jsonb; v_heads uuid[];
begin
  if not exists (select 1 from public.companies where id = p_company and is_demo) then raise exception 'not a demo company'; end if;
  if exists (select 1 from public.source_documents where company_id = p_company) then return jsonb_build_object('skipped', true); end if;
  select id into v_ver from public.baseline_versions where status = 'active' order by activated_at desc limit 1;
  select m.id into v_admin from public.memberships m join public.user_profiles up on up.id = m.user_id
   where m.company_id = p_company and m.status = 'active' order by (m.job_title ilike '%managing director%') desc, m.created_at limit 1;

  -- checklist
  if v_ver is not null then
    insert into public.company_baselines (company_id, version_id) values (p_company, v_ver) on conflict do nothing;
    insert into public.register_items (company_id, version_id, kind, code, title, department_label, criticality)
    select p_company, v_ver, 'document', i.code, coalesce(i.title, i.code), i.department, i.data->>'Audit Criticality'
      from public.baseline_items i where i.version_id = v_ver and i.sheet = 'Department Register' and i.code is not null on conflict do nothing;
    insert into public.register_items (company_id, version_id, kind, code, title, department_label)
    select p_company, v_ver, 'process', i.code, coalesce(i.title, i.code), i.data->>'Accountable (A)'
      from public.baseline_items i where i.version_id = v_ver and i.sheet = 'Process RACI Detail' and i.code is not null on conflict do nothing;
  end if;

  -- records and personal records: counted only
  insert into public.source_documents (company_id, sha256, file_name, folder, ext, size_bytes, category, doc_type, department_code, reason, uploaded_by, created_at)
  select p_company, encode(sha256(convert_to('demo:' || f, 'UTF8')), 'hex'), f, 'Shared drive', lower(substring(f from '\.([a-z]+)$')), 20000 + length(f) * 311,
         'record', case when f ~* 'letter|undertaking' then 'employee letter' when f ~* 'resolution|minutes' then 'minutes or resolution' when f ~* 'photo' then 'photo or scan'
           when f ~* 'agreement' then 'signed agreement' when f ~* 'invoice' then 'financial record' else 'report or list' end,
         case when f ~* 'employee|training' then 'HR' when f ~* 'board|minutes' then 'GOV' when f ~* 'invoice|asset' then 'PROC' when f ~* 'partner' then 'PM' when f ~* 'client' then 'CS' else 'OPS' end,
         'Name suggests a record', v_admin, now() - interval '3 days'
    from unnest(records) f;
  insert into public.source_documents (company_id, sha256, file_name, folder, ext, size_bytes, category, doc_type, department_code, reason, uploaded_by, created_at)
  select p_company, encode(sha256(convert_to('demo:' || f, 'UTF8')), 'hex'), f, 'Shared drive/HR confidential', lower(substring(f from '\.([a-z]+)$')), 30000,
         'sensitive', 'personal or legal record', case when f ~* 'legal' then 'LRC' else 'HR' end, 'Name suggests a personal or legal record', v_admin, now() - interval '3 days'
    from unnest(sensitive) f;

  -- rule documents, analysed
  for r in select * from jsonb_array_elements(rules) loop
    insert into public.source_documents (company_id, sha256, file_name, folder, ext, size_bytes, category, doc_type, department_code, reason, read_status, text_chars,
                                         analysis_status, uploaded_by, created_at)
    values (p_company, encode(sha256(convert_to('demo:' || (r->>'f'), 'UTF8')), 'hex'), r->>'f', r->>'dir', lower(substring(r->>'f' from '\.([a-z]+)$')),
            40000 + length(r->>'f') * 97, 'governing', r->>'type', r->>'dept', 'Name suggests a ' || replace(r->>'type', '_', ' '), 'read', 6000 + length(r->>'f') * 40,
            'done', v_admin, now() - interval '3 days')
    returning id into v_doc;
    insert into public.source_document_texts (document_id, company_id, body)
    values (v_doc, p_company, '# ' || (r->>'f') || E'\n(Demo company — fictional document text.)\n1. Purpose\n2. Scope\n3. Responsibilities\n4. Procedure');
    insert into public.document_analyses (company_id, document_id, result)
    values (p_company, v_doc, jsonb_build_object('kind', r->>'type', 'summary', 'Fictional demo document of Velora Assurance Services.', 'departments', jsonb_build_array(r->>'dept')))
    returning id into v_an;
    if r->>'proc' is not null then
      select jsonb_build_object('nodes', jsonb_build_array(jsonb_build_object('id', 's', 'type', 'start', 'label', 'Start'))
               || coalesce((select jsonb_agg(jsonb_build_object('id', 'n' || o, 'type', case when x ilike 'Decision:%' then 'decision' else 'step' end, 'label', x) order by o)
                            from jsonb_array_elements_text(r->'steps') with ordinality t(x, o)), '[]'::jsonb)
               || jsonb_build_array(jsonb_build_object('id', 'e', 'type', 'end', 'label', 'Done')),
             'edges', jsonb_build_array(jsonb_build_object('from', 's', 'to', 'n1'))
               || coalesce((select jsonb_agg(jsonb_build_object('from', 'n' || o, 'to', case when o = jsonb_array_length(r->'steps') then 'e' else 'n' || (o + 1) end,
                                    'label', case when x ilike 'Decision:%' then 'yes' end) order by o)
                            from jsonb_array_elements_text(r->'steps') with ordinality t(x, o)), '[]'::jsonb))
        into v_flow;
      insert into public.doc_processes (company_id, document_id, analysis_id, name, department_code, owner_role, purpose, trigger_text, flow, controls, approvals, records, sla)
      values (p_company, v_doc, v_an, r->>'proc', r->>'dept', case when r->>'dept' = 'OPS' then null else 'Department head' end,
              'As written in ' || (r->>'f'), 'When the work arrives', v_flow, array['Manager review'], array['Department head'], array['Register / tracker'], '{}');
    end if;
    for g in select * from jsonb_array_elements(r->'gaps') loop
      insert into public.doc_findings (company_id, document_id, analysis_id, kind, severity, department_code, title)
      values (p_company, v_doc, v_an, case when g->>0 = 'conflict' then 'conflict' else 'gap' end, g->>1, r->>'dept', g->>2);
    end loop;
    for g in select * from jsonb_array_elements(r->'risks') loop
      insert into public.doc_findings (company_id, document_id, analysis_id, kind, severity, department_code, title, mitigation)
      values (p_company, v_doc, v_an, 'risk', 'high', r->>'dept', g->>0, g->>1);
    end loop;
    for g in select * from jsonb_array_elements(r->'q') loop
      insert into public.doc_findings (company_id, document_id, analysis_id, kind, severity, department_code, title)
      values (p_company, v_doc, v_an, 'question', 'low', r->>'dept', g #>> '{}');
    end loop;
    insert into public.doc_findings (company_id, document_id, analysis_id, kind, severity, department_code, title, mitigation, source)
    values (p_company, v_doc, v_an, 'control_field', 'medium', r->>'dept', 'Document control missing: document number, approver, next review date',
            'Add a title block with document number, version, effective date, owner, approver and next review date.', 'rule');
    if r->>'match' is not null and v_ver is not null then
      select ri.id into v_reg from public.register_items ri where ri.company_id = p_company and ri.kind = 'document'
         and ri.code like (r->>'dept') || '-%' and ri.title ilike (r->>'match') order by ri.code limit 1;
      if v_reg is null then
        select ri.id into v_reg from public.register_items ri where ri.company_id = p_company and ri.kind = 'document' and ri.title ilike (r->>'match') order by ri.code limit 1;
      end if;
      if v_reg is not null then
        insert into public.doc_register_links (company_id, document_id, register_item_id, coverage, why)
        values (p_company, v_doc, v_reg, case when jsonb_array_length(r->'gaps') > 1 then 'partial' else 'full' end, 'Demo match') on conflict do nothing;
      end if;
      v_reg := null;
    end if;
    n_docs := n_docs + 1;
  end loop;
  insert into public.doc_findings (company_id, document_id, kind, severity, department_code, title, source)
  select p_company, d2.id, 'missing_reference', 'low', 'OPS', 'Referred to but not provided: Quality checklist', 'rule'
    from public.source_documents d2 where d2.company_id = p_company and d2.file_name = 'Quality Check SOP.docx';

  v_cnt := private.doc_finalize_core(p_company);

  -- reviewers: the heads of matching departments, plus the administrator for departments without a match
  for d in select x.code, (select m.id from public.memberships m join public.departments dp on dp.company_id = m.company_id and dp.id = m.primary_department_id
                              where m.company_id = p_company and m.status = 'active' and dp.code = x.dept order by m.created_at limit 1) mid
             from (values ('HR','HR'),('FIN','FIN'),('OPS','OPS'),('CS','CS'),('IT','TECH')) x(code, dept) loop
    if d.mid is not null then insert into public.doc_stakeholders (company_id, department_code, membership_id, added_by) values (p_company, d.code, d.mid, v_admin) on conflict do nothing; end if;
  end loop;
  -- some points already answered by reviewers
  update public.doc_findings f set status = 'confirmed', decided_by = s.membership_id, decided_at = now() - interval '1 day',
         decision_note = case when f.kind = 'question' then 'Answered in the review meeting' else 'Correct — to be fixed in the new version' end
    from public.doc_stakeholders s
   where f.company_id = p_company and s.company_id = f.company_id and s.department_code = f.department_code and f.kind in ('gap', 'question')
     and f.severity <> 'high' and f.department_code in ('FIN', 'HR');
  perform private.doc_departments_ensure(p_company);
  return jsonb_build_object('rule_documents', n_docs, 'records', array_length(records, 1), 'personal', array_length(sensitive, 1), 'checklist', v_cnt);
end $$;
revoke all on function private.build_demo_documents(uuid) from public, anon, authenticated;

/** Creates company departments for document department codes that have none (used by the demo builder). */
create or replace function private.doc_departments_ensure(p_company uuid) returns void
language sql security definer set search_path = '' as $$
  insert into public.departments (company_id, code, name)
  select p_company, c.code, n.name from (select distinct department_code code from public.doc_findings where company_id = p_company and department_code is not null) c
    join (values ('GOV','Board & Company Secretariat'),('BE','Strategy & PMO'),('OPS','Operations'),('HR','Human Resources'),('FIN','Finance & Accounts'),
                 ('BD','Sales & Business Development'),('CS','Client Service'),('PM','Partner Management'),('PROC','Procurement & Administration'),
                 ('IT','IT & Data'),('LRC','Legal, Compliance & Risk')) n(code, name) on n.code = c.code
  on conflict (company_id, code) do nothing
$$;
revoke all on function private.doc_departments_ensure(uuid) from public, anon, authenticated;

select private.build_demo_documents(id) from public.companies where is_demo;
