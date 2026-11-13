-- SYNTHETIC TEST DATA ONLY. Two fictional companies used to prove isolation and workflow rules.
-- Nothing here describes CRUX's real departments, people, processes or authority matrix.
-- User IDs are deterministic: md5('ppi:' || handle)::uuid.

insert into auth.users (id, email)
select md5('ppi:' || h)::uuid, h || '@example.invalid'
  from unnest(array['a_admin','a_ops_head','a_ops_emp','a_fin_head','a_be_reviewer','a_proc_owner','a_approver','a_ai',
                    'b_admin','b_ops_head']) h;
insert into public.user_profiles (id, display_name)
select id, split_part(email, '@', 1) from auth.users where email like '%@example.invalid';

insert into public.companies (id, code, name) values
  ('a0000000-0000-4000-8000-000000000001', 'ALPHA', 'Synthetic Alpha Co (test)'),
  ('b0000000-0000-4000-8000-000000000001', 'BETA',  'Synthetic Beta Co (test)');

insert into public.departments (company_id, code, name)
select 'a0000000-0000-4000-8000-000000000001', c, n from (values ('OPS','Operations (synthetic)'),('FIN','Finance (synthetic)'),('BE','Business Excellence (synthetic)')) v(c,n);
insert into public.departments (company_id, code, name, parent_department_id)
select company_id, 'OPS-N', 'Operations North (synthetic)', id from public.departments where code = 'OPS' and company_id = 'a0000000-0000-4000-8000-000000000001';
insert into public.departments (company_id, code, name) values ('b0000000-0000-4000-8000-000000000001', 'OPS', 'Operations (synthetic)');

-- memberships
insert into public.memberships (company_id, user_id, member_kind, job_title, primary_department_id, status)
select c.id, md5('ppi:' || v.h)::uuid, v.kind, v.title, d.id, 'active'
  from (values ('ALPHA','a_admin','human','Administrator','BE'), ('ALPHA','a_ops_head','human','Head of Operations','OPS'),
               ('ALPHA','a_ops_emp','human','Operations Executive','OPS'), ('ALPHA','a_fin_head','human','Head of Finance','FIN'),
               ('ALPHA','a_be_reviewer','human','BE Reviewer','BE'), ('ALPHA','a_proc_owner','human','Process Owner','OPS'),
               ('ALPHA','a_approver','human','Director','BE'), ('ALPHA','a_ai','service','AI orchestrator service','BE'),
               ('BETA','b_admin','human','Administrator','OPS'), ('BETA','b_ops_head','human','Head of Operations','OPS')) v(co,h,kind,title,dept)
  join public.companies c on c.code = v.co
  join public.departments d on d.company_id = c.id and d.code = v.dept;

-- candidate roles (AQ-005: to be confirmed by CRUX)
insert into public.roles (company_id, code, name)
select c.id, r.code, r.name from public.companies c
 cross join (values ('COMPANY_ADMIN','Company administrator (technical)'), ('DEPT_HEAD','Department head'),
                    ('EMPLOYEE','Participant / employee'), ('BE_REVIEWER','Business Excellence reviewer'),
                    ('PROCESS_OWNER','Process owner'), ('DOC_APPROVER','Document approver'),
                    ('AI_SERVICE','AI orchestrator service identity')) r(code, name);

insert into public.role_permissions (company_id, role_id, permission_code)
select r.company_id, r.id, p.perm from public.roles r
 join (values
  ('COMPANY_ADMIN', array['org.manage','membership.manage','role.manage','audit.read','dashboard.read','catalogue.manage','catalogue.approve']),
  ('DEPT_HEAD', array['process.read','process.edit','interview.manage','interview.review','evidence.read','evidence.upload','evidence.review',
                      'knowledge.read','knowledge.edit','knowledge.verify','clarification.create','clarification.respond','clarification.manage',
                      'dispute.raise','document.read','document.draft','classified.confidential_read','dashboard.read','ai.run']),
  ('EMPLOYEE', array['process.read','knowledge.read','evidence.upload','clarification.create','dispute.raise','document.read']),
  ('BE_REVIEWER', array['process.read','knowledge.read','knowledge.verify','evidence.read','interview.review','document.read',
                        'document.review_functional','dispute.raise','clarification.create','dashboard.read']),
  ('PROCESS_OWNER', array['process.read','process.edit','process.approve','knowledge.read','knowledge.edit','knowledge.verify',
                          'document.read','document.review_owner','dispute.raise']),
  ('DOC_APPROVER', array['process.read','knowledge.read','knowledge.approve','document.read','document.approve','document.publish',
                         'dispute.decide','dashboard.read','classified.confidential_read','catalogue.approve']),
  ('AI_SERVICE', array['process.read','knowledge.read','knowledge.edit','interview.review','evidence.read','ai.run'])
 ) v(code, perms) on v.code = r.code
 cross join lateral unnest(v.perms) p(perm);

-- scoped assignments
insert into public.role_assignments (company_id, membership_id, role_id, scope_type, scope_department_id)
select c.id, m.id, r.id, v.scope, case when v.scope = 'department' then d.id end
  from (values ('ALPHA','a_admin','COMPANY_ADMIN','company',null), ('ALPHA','a_ops_head','DEPT_HEAD','department','OPS'),
               ('ALPHA','a_ops_emp','EMPLOYEE','department','OPS'), ('ALPHA','a_fin_head','DEPT_HEAD','department','FIN'),
               ('ALPHA','a_be_reviewer','BE_REVIEWER','company',null), ('ALPHA','a_approver','DOC_APPROVER','company',null),
               ('ALPHA','a_ai','AI_SERVICE','company',null),
               ('BETA','b_admin','COMPANY_ADMIN','company',null), ('BETA','b_ops_head','DEPT_HEAD','department','OPS')) v(co,h,role,scope,dept)
  join public.companies c on c.code = v.co
  join public.memberships m on m.company_id = c.id and m.user_id = md5('ppi:' || v.h)::uuid
  join public.roles r on r.company_id = c.id and r.code = v.role
  left join public.departments d on d.company_id = c.id and d.code = v.dept;

-- synthetic processes
insert into public.processes (company_id, code, name, purpose, owner_department_id, classification, status)
select c.id, v.code, v.name, 'Synthetic test process', d.id, v.cls, 'in_discovery'
  from (values ('ALPHA','OPS-P01','Synthetic request intake','OPS','internal'),
               ('ALPHA','FIN-P01','Synthetic vendor payment','FIN','confidential'),
               ('BETA','OPS-P01','Synthetic request intake (Beta)','OPS','internal')) v(co,code,name,dept,cls)
  join public.companies c on c.code = v.co
  join public.departments d on d.company_id = c.id and d.code = v.dept;

-- process-scoped owner role
insert into public.role_assignments (company_id, membership_id, role_id, scope_type, scope_process_id)
select c.id, m.id, r.id, 'process', p.id
  from public.companies c
  join public.memberships m on m.company_id = c.id and m.user_id = md5('ppi:a_proc_owner')::uuid
  join public.roles r on r.company_id = c.id and r.code = 'PROCESS_OWNER'
  join public.processes p on p.company_id = c.id and p.code = 'OPS-P01'
 where c.code = 'ALPHA';

-- documents: SOP type + three-step route
insert into public.document_types (company_id, code, name, default_review_months)
select id, 'SOP', 'Standard operating procedure', 12 from public.companies;
insert into public.approval_routes (company_id, code, name, document_type_id)
select t.company_id, 'SOP-STD', 'Standard SOP route', t.id from public.document_types t where t.code = 'SOP';
insert into public.approval_route_steps (company_id, route_id, step_no, step_kind, required_permission)
select r.company_id, r.id, s.no, s.kind, s.perm from public.approval_routes r
 cross join (values (1,'owner_review','document.review_owner'), (2,'functional_review','document.review_functional'),
                    (3,'management_approval','document.approve')) s(no,kind,perm);
update public.approval_routes set status = 'active';

-- AI provider policy (D-011) and one active prompt per company
insert into public.ai_provider_policies (company_id, provider, max_classification, may_train_on_inputs, terms_checked_on, notes)
select id, v.p, v.maxc, v.train, date '2026-11-11', v.note from public.companies
 cross join (values ('local_ollama','confidential',false,'Runs on CRUX-controlled hardware'),
                    ('gemini_free','public',true,'Unpaid tier: inputs may be used to improve products and human-reviewed')) v(p,maxc,train,note);
insert into public.prompt_versions (company_id, prompt_key, version, purpose, template_sha256, output_schema, status)
select id, 'extract.process_steps', 1, 'Extract structured process steps with source IDs',
       encode(extensions.digest('synthetic template v1', 'sha256'), 'hex'),
       '{"type":"object","required":["claims"]}'::jsonb, 'active' from public.companies;
