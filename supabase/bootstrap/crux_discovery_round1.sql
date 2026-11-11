-- CRUX discovery round 1 (applied 2026-11-11, decided by Claude on Shantanu's delegation).
-- One public-facing join link → self sign-up by mobile → chat interview in 3 sections:
--   1 Self & profile (scope 'general')  2 Company (scope 'company_dna', pack template C)  3 Process (scope 'process', pack template B)
-- Everyone lands in the holding department ALL until real departments are set up from their answers (AQ-002).
-- Returns the join token ONCE (only its SHA-256 is stored).
do $$
declare v_co uuid; v_dept uuid; v_owner uuid; v_camp uuid;
begin
  select id into v_co from public.companies where code = 'CRUX';
  select m.id into v_owner from public.memberships m join auth.users u on u.id = m.user_id
   where m.company_id = v_co and lower(u.email) = lower(current_setting('ppi.admin_email'));

  insert into public.departments (company_id, code, name, mandate)
  values (v_co, 'ALL', 'All staff (discovery round 1)', 'Holding group for everyone who joins through the discovery link; real departments are set up from the answers.')
  returning id into v_dept;

  update public.question_templates set status = 'retired' where company_id = v_co and status = 'active';

  insert into public.question_templates (company_id, code, scope_type, field_key, question_text, help_text, answer_type, choices, status)
  select v_co, q.code, q.scope, q.field, q.text, q.help, q.atype, q.choices::jsonb, 'active' from (values
    ('S-01','general','self.designation','What is your designation or job title?',null,'text',null),
    ('S-02','general','self.department','Which department or team do you work in?','Write it the way you and your colleagues call it.','text',null),
    ('S-03','general','self.location','Which city, branch or zone do you work from?',null,'text',null),
    ('S-04','general','self.role_type','What kind of work do you mainly do?',null,'choice','["Field work","Back office / desk work","Supervisor or team lead","Manager or department head","Other"]'),
    ('S-05','general','self.reports_to','Who do you report to? (their role, and name if you like)',null,'text',null),
    ('S-06','general','self.tenure','How long have you worked at CRUX?',null,'choice','["Less than 6 months","6–12 months","1–3 years","3–5 years","More than 5 years"]'),
    ('S-07','general','self.responsibilities','In 2–3 lines, what are your main responsibilities?',null,'text',null),
    ('S-08','general','self.tools','Which software, portals or tools do you use every day?','For example the case system, Excel, email or WhatsApp.','text',null),
    ('C-01','company_dna','company.purpose','In your own words, what does CRUX do, and why do clients come to us?',null,'text',null),
    ('C-02','company_dna','company.services','Which CRUX services or service lines do you know about?',null,'text',null),
    ('C-03','company_dna','company.customers','Who are CRUX''s main clients or types of customers?',null,'text',null),
    ('C-04','company_dna','company.differentiation','What makes CRUX different from other companies doing similar work?',null,'text',null),
    ('C-05','company_dna','company.values','Which values or behaviours does CRUX expect from its people?',null,'text',null),
    ('C-06','company_dna','company.priorities','What do you think are the company''s most important goals right now?',null,'text',null),
    ('C-07','company_dna','company.boundaries','What must never go wrong in our work?','For example confidentiality, accuracy, deadlines, client rules.','text',null),
    ('C-08','company_dna','company.documents','Which company policies, SOPs or rule documents do you follow?','Name them if you can, or say “none”.','text',null),
    ('R-01','process','process.name','What is the main process or work you handle? Give it a short name.',null,'text',null),
    ('R-02','process','process.trigger','What starts this work, and where does it come from?',null,'text',null),
    ('R-03','process','process.customer_output','Who is it for, and what exactly do you deliver at the end?',null,'text',null),
    ('R-04','process','process.inputs','What inputs, documents or information do you need before you can start?',null,'text',null),
    ('R-05','process','process.steps','Explain the steps in order: what happens, who does it, and which system is used.','One step per line is fine.','text',null),
    ('R-06','process','process.decisions','At which points is a decision or approval needed, and who gives it?',null,'text',null),
    ('R-07','process','process.handoffs','Who do you hand the work over to, and how long does it usually wait?',null,'text',null),
    ('R-08','process','process.tat','What turnaround time (TAT) is expected, and how is it measured?',null,'text',null),
    ('R-09','process','process.exceptions','What usually goes wrong, and how is it fixed or escalated?',null,'text',null),
    ('R-10','process','process.records','Which records, reports or evidence are created, and where are they kept?',null,'text',null),
    ('R-11','process','process.improvements','What shortcut or workaround do you use today, or what would you improve first?',null,'text',null),
    ('R-12','process','process.other_people','Who else should we talk to about this process?',null,'text',null)
  ) q(code, scope, field, text, help, atype, choices);

  insert into public.interview_campaigns (company_id, code, name, purpose, department_id, owner_membership_id, status, question_scopes)
  values (v_co, 'CRUX-DISC-01', 'CRUX process discovery — round 1',
          'We are writing down how work really happens at CRUX today, so we can build accurate SOPs and fix what slows us down. Answer from your own experience — “I don''t know” is a fine answer. Nothing you write becomes company policy without review.',
          v_dept, v_owner, 'active', array['general','company_dna','process'])
  returning id into v_camp;

  perform set_config('ppi.join_token', translate(encode(extensions.gen_random_bytes(18), 'base64'), '+/=', '-_'), false);
  insert into public.company_join_links (company_id, label, token_sha256, campaign_id, department_id, created_by_membership_id)
  values (v_co, 'All-staff discovery link (round 1)', encode(extensions.digest(current_setting('ppi.join_token'), 'sha256'), 'hex'), v_camp, v_dept, v_owner);
end $$;
select current_setting('ppi.join_token') as join_token;

-- 2026-11-11 (S-07): reviewer permissions for the Discovery lead role (review → knowledge → follow-up → dispute).
-- dispute.decide deliberately NOT added: the person raising a dispute should not also judge it.
insert into public.role_permissions (company_id, role_id, permission_code)
select r.company_id, r.id, p from public.roles r
 cross join unnest(array['knowledge.edit','knowledge.verify','clarification.create','clarification.manage','dispute.raise']) p
 where r.code = 'DISCOVERY_LEAD' and r.company_id = (select id from public.companies where code = 'CRUX')
on conflict do nothing;
