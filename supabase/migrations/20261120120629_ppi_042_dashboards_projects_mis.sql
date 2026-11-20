-- PPI-042: dashboards (company admin, project manager, stakeholder), engagement projects, MIS reports (D-097, D-100).
-- * New permissions: report.read (MIS), project.manage. New role STAKEHOLDER (read-only leadership view).
-- * Scope: a company-wide role sees the whole company; a department-scoped role (e.g. DEPT_HEAD) sees its departments only.
-- * A project manager / sponsor sees the dashboard of their project (its departments) even without dashboard.read.
-- * Reports and dashboards return figures and work items only — never interview answers or document content.

insert into public.permissions (code, description) values
  ('report.read', 'Read MIS reports and export them'),
  ('project.manage', 'Create and run engagement projects and milestones')
on conflict (code) do nothing;

create or replace function private.ensure_reporting_roles(p_company uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_role uuid;
begin
  insert into public.roles (company_id, code, name, description)
  values (p_company, 'STAKEHOLDER', 'Stakeholder', 'Leadership and sponsors: sees dashboards, MIS reports and approved documents; changes nothing')
  on conflict do nothing;
  select id into v_role from public.roles where company_id = p_company and code = 'STAKEHOLDER';
  insert into public.role_permissions (company_id, role_id, permission_code)
  select p_company, v_role, p from unnest(array['dashboard.read', 'report.read', 'document.read', 'process.read', 'knowledge.read']) p
  on conflict do nothing;
  insert into public.role_permissions (company_id, role_id, permission_code)
  select p_company, r.id, 'report.read' from public.roles r where r.company_id = p_company and r.code in ('COMPANY_ADMIN', 'DISCOVERY_LEAD', 'DOC_APPROVER', 'DEPT_HEAD')
  on conflict do nothing;
  insert into public.role_permissions (company_id, role_id, permission_code)
  select p_company, r.id, 'project.manage' from public.roles r where r.company_id = p_company and r.code in ('COMPANY_ADMIN', 'DISCOVERY_LEAD')
  on conflict do nothing;
end $$;
revoke all on function private.ensure_reporting_roles(uuid) from public, anon, authenticated;
select private.ensure_reporting_roles(id) from public.companies;

/** Departments a person may report on for a permission: null = whole company; empty array = none. */
create or replace function private.scoped_departments(p_company uuid, p_perm text) returns uuid[]
language sql stable security definer set search_path = '' as $$
  select case when private.has_permission(p_company, p_perm) then null
              else coalesce((select array_agg(d.id) from public.departments d where d.company_id = p_company and private.has_permission(p_company, p_perm, d.id)), '{}') end
$$;
revoke all on function private.scoped_departments(uuid, text) from public, anon;
grant execute on function private.scoped_departments(uuid, text) to authenticated, service_role;

-- ---------------------------------------------------------------- projects
create table public.projects (
  id                        uuid not null default gen_random_uuid() primary key,
  company_id                uuid not null references public.companies(id),
  code                      text not null check (code ~ '^[A-Z0-9][A-Z0-9-]{1,19}$'),
  name                      text not null check (length(trim(name)) between 3 and 120),
  objective                 text check (objective is null or length(objective) <= 2000),
  manager_membership_id     uuid,
  sponsor_membership_id     uuid,
  department_ids            uuid[] not null default '{}',
  starts_on                 date,
  target_end_on             date,
  status                    text not null default 'active' check (status in ('planning', 'active', 'on_hold', 'completed', 'cancelled')),
  created_by_membership_id  uuid,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),
  unique (company_id, id), unique (company_id, code),
  check (target_end_on is null or starts_on is null or target_end_on >= starts_on),
  foreign key (company_id, manager_membership_id) references public.memberships(company_id, id),
  foreign key (company_id, sponsor_membership_id) references public.memberships(company_id, id)
);
create index projects_manager_idx on public.projects (company_id, manager_membership_id);
create index projects_sponsor_idx on public.projects (company_id, sponsor_membership_id);
create trigger projects_updated before update on public.projects for each row execute function private.set_updated_at();
create trigger audit_projects after insert or update on public.projects for each row execute function private.audit_row();

create table public.project_milestones (
  id                   uuid not null default gen_random_uuid() primary key,
  company_id           uuid not null,
  project_id           uuid not null,
  title                text not null check (length(trim(title)) between 2 and 200),
  due_on               date,
  owner_membership_id  uuid,
  done_at              timestamptz,
  sort_order           int not null default 100,
  created_at           timestamptz not null default now(),
  foreign key (company_id, project_id) references public.projects(company_id, id),
  foreign key (company_id, owner_membership_id) references public.memberships(company_id, id)
);
create index project_milestones_project_idx on public.project_milestones (company_id, project_id);
create index project_milestones_owner_idx on public.project_milestones (company_id, owner_membership_id);
create trigger audit_project_milestones after insert or update on public.project_milestones for each row execute function private.audit_row();

alter table public.projects enable row level security;
alter table public.project_milestones enable row level security;
create policy projects_read on public.projects for select to authenticated using ((select private.my_membership(company_id)) is not null);
create policy project_milestones_read on public.project_milestones for select to authenticated using ((select private.my_membership(company_id)) is not null);
revoke all on public.projects, public.project_milestones from anon;
revoke insert, update, delete, truncate, references, trigger on public.projects, public.project_milestones from authenticated;
grant select on public.projects, public.project_milestones to authenticated;

create or replace function private.can_run_project(p_company uuid, p_project uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.has_permission(p_company, 'project.manage')
      or exists (select 1 from public.projects p where p.id = p_project and p.company_id = p_company and p.manager_membership_id = private.my_membership(p_company))
$$;
revoke all on function private.can_run_project(uuid, uuid) from public, anon;
grant execute on function private.can_run_project(uuid, uuid) to authenticated;

create or replace function public.project_save(p_company uuid, p_id uuid, p_code text, p_name text, p_objective text, p_manager uuid, p_sponsor uuid,
  p_departments uuid[], p_starts date, p_target_end date, p_status text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_id uuid := coalesce(p_id, gen_random_uuid());
begin
  if not (private.has_permission(p_company, 'project.manage') or (p_id is not null and private.can_run_project(p_company, p_id))) then
    raise exception 'PPI_FORBIDDEN: project managers and administrators only' using errcode = '42501'; end if;
  if p_id is not null and not exists (select 1 from public.projects where id = p_id and company_id = p_company) then
    raise exception 'PPI_INPUT: project not found' using errcode = 'P0001'; end if;
  if exists (select 1 from unnest(coalesce(p_departments, '{}')) d where not exists (select 1 from public.departments x where x.id = d and x.company_id = p_company)) then
    raise exception 'PPI_INPUT: unknown department' using errcode = 'P0001'; end if;
  insert into public.projects (id, company_id, code, name, objective, manager_membership_id, sponsor_membership_id, department_ids, starts_on, target_end_on, status, created_by_membership_id)
  values (v_id, p_company, upper(trim(p_code)), trim(p_name), nullif(trim(coalesce(p_objective, '')), ''), p_manager, p_sponsor, coalesce(p_departments, '{}'),
          p_starts, p_target_end, coalesce(p_status, 'active'), private.my_membership(p_company))
  on conflict (id) do update set code = excluded.code, name = excluded.name, objective = excluded.objective, manager_membership_id = excluded.manager_membership_id,
    sponsor_membership_id = excluded.sponsor_membership_id, department_ids = excluded.department_ids, starts_on = excluded.starts_on,
    target_end_on = excluded.target_end_on, status = excluded.status;
  return v_id;
exception when unique_violation then raise exception 'PPI_INPUT: that project code is already used' using errcode = 'P0001';
end $$;

create or replace function public.project_milestone_save(p_company uuid, p_project uuid, p_id uuid, p_title text, p_due date, p_owner uuid, p_done boolean)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid := coalesce(p_id, gen_random_uuid());
begin
  if not private.can_run_project(p_company, p_project) then raise exception 'PPI_FORBIDDEN: project managers and administrators only' using errcode = '42501'; end if;
  if p_id is null then
    insert into public.project_milestones (id, company_id, project_id, title, due_on, owner_membership_id, done_at, sort_order)
    values (v_id, p_company, p_project, trim(p_title), p_due, p_owner, case when p_done then now() end,
            coalesce((select max(sort_order) + 10 from public.project_milestones where project_id = p_project), 100));
  else
    update public.project_milestones set title = coalesce(nullif(trim(p_title), ''), title), due_on = coalesce(p_due, due_on), owner_membership_id = coalesce(p_owner, owner_membership_id),
      done_at = case when p_done is null then done_at when p_done then coalesce(done_at, now()) else null end
     where id = p_id and project_id = p_project and company_id = p_company;
    if not found then raise exception 'PPI_INPUT: milestone not found' using errcode = 'P0001'; end if;
  end if;
  return v_id;
end $$;
revoke all on function public.project_save(uuid, uuid, text, text, text, uuid, uuid, uuid[], date, date, text),
  public.project_milestone_save(uuid, uuid, uuid, text, date, uuid, boolean) from public, anon;
grant execute on function public.project_save(uuid, uuid, text, text, text, uuid, uuid, uuid[], date, date, text),
  public.project_milestone_save(uuid, uuid, uuid, text, date, uuid, boolean) to authenticated;

-- ---------------------------------------------------------------- dashboard
create or replace function public.company_dashboard(p_company uuid, p_project uuid default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_d uuid[]; pr record; v_whole boolean; v_now timestamptz := now(); v_30 timestamptz := now() - interval '30 days';
begin
  if p_project is not null then
    select * into pr from public.projects where id = p_project and company_id = p_company;
    if pr.id is null then raise exception 'PPI_INPUT: project not found' using errcode = 'P0001'; end if;
    if not (private.has_permission_anywhere(p_company, 'dashboard.read') or private.my_membership(p_company) in (pr.manager_membership_id, pr.sponsor_membership_id)) then
      raise exception 'PPI_FORBIDDEN: not your project' using errcode = '42501'; end if;
    v_d := nullif(pr.department_ids, '{}');
  else
    if not private.has_permission_anywhere(p_company, 'dashboard.read') then raise exception 'PPI_FORBIDDEN: dashboard access needed' using errcode = '42501'; end if;
    v_d := private.scoped_departments(p_company, 'dashboard.read');
  end if;
  v_whole := v_d is null;

  return jsonb_build_object(
    'scope', case when v_whole then 'company' else 'departments' end,
    'people', (select jsonb_build_object(
        'active', count(*) filter (where m.status = 'active'), 'invited', count(*) filter (where m.status = 'invited'))
      from public.memberships m where m.company_id = p_company and m.member_kind = 'human' and (v_whole or m.primary_department_id = any(v_d))),
    'interviews', (select jsonb_build_object(
        'assigned', count(distinct a.respondent_membership_id) filter (where a.status not in ('cancelled', 'declined', 'expired')),
        'started', count(distinct a.respondent_membership_id) filter (where s.id is not null),
        'submitted', count(distinct a.respondent_membership_id) filter (where s.submitted_at is not null))
      from public.interview_assignments a left join public.interview_sessions s on s.assignment_id = a.id
      where a.company_id = p_company and (v_whole or a.department_id = any(v_d))),
    'processes', (select jsonb_build_object(
        'discovered', (select count(*) from public.discovered_processes dp join public.memberships m on m.id = dp.membership_id
                        where dp.company_id = p_company and dp.status <> 'removed' and (v_whole or m.primary_department_id = any(v_d))),
        'catalogued', count(*), 'performed', count(*) filter (where ci.process_status in ('performed', 'partial')),
        'documented', count(*) filter (where ci.document_status = 'approved'),
        'doc_gaps', count(*) filter (where ci.process_status in ('performed', 'partial') and ci.document_status in ('none', 'unknown', 'outdated')),
        'validated', count(*) filter (where (select pv.decision from public.process_validations pv where pv.item_id = ci.id order by pv.decided_at desc limit 1) = 'validated'))
      from public.catalogue_items ci join public.catalogue_functions f on f.id = ci.function_id
      where ci.company_id = p_company and ci.status <> 'retired' and (v_whole or f.department_id = any(v_d))),
    'documents', case when v_whole then (select jsonb_build_object(
        'approved', count(*) filter (where status = 'approved'), 'awaiting', count(*) filter (where status = 'awaiting_approval'),
        'in_progress', count(*) filter (where status in ('queued', 'running', 'waiting')),
        'avg_days_to_approval', round(avg(extract(epoch from decided_at - created_at) / 86400) filter (where status = 'approved' and decided_at is not null), 1),
        'released', (select count(*) from public.document_releases r where r.company_id = p_company and r.revoked_at is null))
      from public.board_cases where company_id = p_company) end,
    'work', (select jsonb_build_object(
        'open', count(*) filter (where t.status in ('open', 'in_progress', 'waiting')),
        'overdue', count(*) filter (where t.status in ('open', 'in_progress', 'waiting') and t.due_at < v_now),
        'escalated', count(*) filter (where t.status in ('open', 'in_progress', 'waiting') and t.escalated_at is not null),
        'resolved_30d', count(*) filter (where t.resolved_at >= v_30),
        'avg_days_to_resolve_30d', round(avg(extract(epoch from t.resolved_at - t.created_at) / 86400) filter (where t.resolved_at >= v_30), 1))
      from public.tickets t left join public.memberships am on am.id = t.assignee_membership_id
      where t.company_id = p_company and not t.to_platform and (v_whole or coalesce(t.assignee_department_id, am.primary_department_id) = any(v_d))),
    'questions', (select jsonb_build_object(
        'open', count(*) filter (where c.status in ('open', 'assigned', 'escalated')),
        'overdue', count(*) filter (where c.status in ('open', 'assigned', 'escalated') and c.due_at < v_now))
      from public.clarification_tasks c where c.company_id = p_company and (v_whole or c.assignee_department_id = any(v_d))),
    'leadership_questions_open', case when v_whole then (select count(*) from public.blueprint_open_questions q where q.company_id = p_company and q.status = 'open') end,
    'ai_30d', case when v_whole then (select jsonb_build_object('succeeded', count(*) filter (where status = 'succeeded'), 'failed', count(*) filter (where status <> 'succeeded'))
      from public.ai_runs where company_id = p_company and created_at >= v_30) end,
    'by_department', (select coalesce(jsonb_agg(x order by x ->> 'name'), '[]') from (
      select jsonb_build_object('id', d.id, 'name', d.name,
        'members', (select count(*) from public.memberships m where m.company_id = p_company and m.member_kind = 'human' and m.status = 'active' and m.primary_department_id = d.id),
        'assigned', (select count(distinct a.respondent_membership_id) from public.interview_assignments a where a.company_id = p_company and a.department_id = d.id and a.status not in ('cancelled', 'declined', 'expired')),
        'submitted', (select count(distinct a.respondent_membership_id) from public.interview_assignments a join public.interview_sessions s on s.assignment_id = a.id
                       where a.company_id = p_company and a.department_id = d.id and s.submitted_at is not null),
        'processes', (select count(*) from public.catalogue_items ci join public.catalogue_functions f on f.id = ci.function_id where ci.company_id = p_company and ci.status <> 'retired' and f.department_id = d.id),
        'documented', (select count(*) from public.catalogue_items ci join public.catalogue_functions f on f.id = ci.function_id where ci.company_id = p_company and ci.status <> 'retired' and f.department_id = d.id and ci.document_status = 'approved'),
        'open_work', (select count(*) from public.tickets t where t.company_id = p_company and not t.to_platform and t.assignee_department_id = d.id and t.status in ('open', 'in_progress', 'waiting')),
        'overdue_work', (select count(*) from public.tickets t where t.company_id = p_company and not t.to_platform and t.assignee_department_id = d.id and t.status in ('open', 'in_progress', 'waiting') and t.due_at < v_now)) x
      from public.departments d where d.company_id = p_company and d.status = 'active' and (v_whole or d.id = any(v_d))) q),
    'trend', (select coalesce(jsonb_agg(jsonb_build_object('week', w::date,
        'answers', (select count(*) from public.interview_answers x join public.memberships m on m.id = x.answered_by_membership_id
                     where x.company_id = p_company and x.answered_at >= w and x.answered_at < w + interval '7 days' and (v_whole or m.primary_department_id = any(v_d))),
        'resolved', (select count(*) from public.tickets t where t.company_id = p_company and not t.to_platform and t.resolved_at >= w and t.resolved_at < w + interval '7 days'
                       and (v_whole or t.assignee_department_id = any(v_d)))) order by w), '[]')
      from generate_series(date_trunc('week', v_now) - interval '7 weeks', date_trunc('week', v_now), interval '1 week') w),
    'champions', (select coalesce(jsonb_agg(jsonb_build_object('membership_id', mid, 'answers', a, 'resolved', r, 'helped', h, 'score', score) order by score desc), '[]') from (
      select mid, a, r, h, a + 3 * r + 2 * h as score from (
        select m.id mid,
          (select count(*) from public.interview_answers x where x.answered_by_membership_id = m.id and x.answered_at >= v_30) a,
          (select count(*) from public.tickets t where t.assignee_membership_id = m.id and t.resolved_at >= v_30) r,
          (select count(*) from public.clarification_responses cr where cr.responder_membership_id = m.id and cr.created_at >= v_30) h
        from public.memberships m where m.company_id = p_company and m.member_kind = 'human' and m.status = 'active' and (v_whole or m.primary_department_id = any(v_d))) s
      where a + r + h > 0 order by a + 3 * r + 2 * h desc limit 5) c)
  );
end $$;
revoke all on function public.company_dashboard(uuid, uuid) from public, anon;
grant execute on function public.company_dashboard(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------- MIS reports
-- Returns {title, columns[], rows[][]}. Department-scoped readers get their departments only; company-level reports
-- (documents, AI, API, billing, projects) need company-wide report.read; billing and API usage also need org.manage.
create or replace function public.mis_report(p_company uuid, p_report text, p_from date default null, p_to date default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_d uuid[]; v_whole boolean; f timestamptz; t timestamptz; v_rows jsonb; v_cols text[]; v_title text; v_now timestamptz := now();
        v_from date := coalesce(p_from, date_trunc('month', (now() at time zone 'Asia/Kolkata'))::date);
        v_to date := coalesce(p_to, (now() at time zone 'Asia/Kolkata')::date);
begin
  if not private.has_permission_anywhere(p_company, 'report.read') then raise exception 'PPI_FORBIDDEN: MIS access needed' using errcode = '42501'; end if;
  if v_to < v_from or v_to - v_from > 731 then raise exception 'PPI_INPUT: choose a period of up to two years' using errcode = 'P0001'; end if;
  v_d := private.scoped_departments(p_company, 'report.read'); v_whole := v_d is null;
  f := v_from::timestamp at time zone 'Asia/Kolkata'; t := (v_to + 1)::timestamp at time zone 'Asia/Kolkata';
  if p_report in ('documents', 'ai_usage', 'projects', 'api_usage', 'billing') and not v_whole then
    raise exception 'PPI_FORBIDDEN: this report is company-wide; ask a company administrator' using errcode = '42501'; end if;
  if p_report in ('api_usage', 'billing') and not private.has_permission(p_company, 'org.manage') then
    raise exception 'PPI_FORBIDDEN: company administrators only' using errcode = '42501'; end if;

  if p_report = 'participation' then
    v_title := 'Participation by department'; v_cols := array['Department', 'Active people', 'Invited, not joined', 'Interviews assigned', 'Started', 'Completed', 'Completion %'];
    select jsonb_agg(jsonb_build_array(d.name, x.active, x.invited, x.assigned, x.started, x.done, case when x.assigned > 0 then round(100.0 * x.done / x.assigned) end) order by d.name) into v_rows
      from public.departments d cross join lateral (select
        (select count(*) from public.memberships m where m.company_id = p_company and m.member_kind = 'human' and m.status = 'active' and m.primary_department_id = d.id) active,
        (select count(*) from public.memberships m where m.company_id = p_company and m.member_kind = 'human' and m.status = 'invited' and m.primary_department_id = d.id) invited,
        (select count(distinct a.respondent_membership_id) from public.interview_assignments a where a.department_id = d.id and a.status not in ('cancelled', 'declined', 'expired')) assigned,
        (select count(distinct a.respondent_membership_id) from public.interview_assignments a join public.interview_sessions s on s.assignment_id = a.id where a.department_id = d.id) started,
        (select count(distinct a.respondent_membership_id) from public.interview_assignments a join public.interview_sessions s on s.assignment_id = a.id where a.department_id = d.id and s.submitted_at is not null) done) x
     where d.company_id = p_company and d.status = 'active' and (v_whole or d.id = any(v_d));

  elsif p_report = 'people_progress' then
    v_title := 'Interview progress by person'; v_cols := array['Person', 'Job title', 'Department', 'Membership', 'Interview', 'Answers given', 'Answers in period', 'Last activity'];
    select jsonb_agg(jsonb_build_array(coalesce(up.display_name, '—'), m.job_title, d.name, m.status,
        case when s.submitted_at is not null then 'Completed' when s.id is not null then 'In progress' when a.id is not null then 'Not started' else 'Not assigned' end,
        (select count(*) from public.interview_answers x where x.answered_by_membership_id = m.id),
        (select count(*) from public.interview_answers x where x.answered_by_membership_id = m.id and x.answered_at >= f and x.answered_at < t),
        to_char((select max(x.answered_at) from public.interview_answers x where x.answered_by_membership_id = m.id) at time zone 'Asia/Kolkata', 'YYYY-MM-DD HH24:MI'))
        order by d.name nulls last, up.display_name) into v_rows
      from public.memberships m left join public.user_profiles up on up.id = m.user_id left join public.departments d on d.id = m.primary_department_id
      left join lateral (select * from public.interview_assignments a where a.respondent_membership_id = m.id order by a.created_at desc limit 1) a on true
      left join lateral (select * from public.interview_sessions s where s.assignment_id = a.id order by s.started_at desc limit 1) s on true
     where m.company_id = p_company and m.member_kind = 'human' and m.status in ('active', 'invited') and (v_whole or m.primary_department_id = any(v_d));

  elsif p_report = 'process_register' then
    v_title := 'Process register'; v_cols := array['Code', 'Process', 'Function', 'Department', 'Kind', 'Classification', 'Process status', 'Document status', 'Validated', 'Last update'];
    select jsonb_agg(jsonb_build_array(ci.code, ci.title, fn.name, d.name, ci.kind, ci.classification, ci.process_status, ci.document_status,
        case when (select pv.decision from public.process_validations pv where pv.item_id = ci.id order by pv.decided_at desc limit 1) = 'validated' then 'Yes' else 'No' end,
        to_char(ci.updated_at at time zone 'Asia/Kolkata', 'YYYY-MM-DD')) order by ci.code) into v_rows
      from public.catalogue_items ci join public.catalogue_functions fn on fn.id = ci.function_id left join public.departments d on d.id = fn.department_id
     where ci.company_id = p_company and ci.status <> 'retired' and (v_whole or fn.department_id = any(v_d));

  elsif p_report = 'discovery_funnel' then
    v_title := 'Discovery funnel by department'; v_cols := array['Department', 'Found in interviews', 'In the register', 'Performed', 'Validated', 'Documented (approved)', 'Documentation gaps'];
    select jsonb_agg(jsonb_build_array(d.name,
        (select count(*) from public.discovered_processes dp join public.memberships m on m.id = dp.membership_id where dp.company_id = p_company and dp.status <> 'removed' and m.primary_department_id = d.id),
        x.n, x.performed, x.validated, x.documented, x.gaps) order by d.name) into v_rows
      from public.departments d cross join lateral (select count(*) n, count(*) filter (where ci.process_status in ('performed', 'partial')) performed,
          count(*) filter (where (select pv.decision from public.process_validations pv where pv.item_id = ci.id order by pv.decided_at desc limit 1) = 'validated') validated,
          count(*) filter (where ci.document_status = 'approved') documented,
          count(*) filter (where ci.process_status in ('performed', 'partial') and ci.document_status in ('none', 'unknown', 'outdated')) gaps
        from public.catalogue_items ci join public.catalogue_functions fn on fn.id = ci.function_id where ci.company_id = p_company and ci.status <> 'retired' and fn.department_id = d.id) x
     where d.company_id = p_company and d.status = 'active' and (v_whole or d.id = any(v_d));

  elsif p_report = 'documents' then
    v_title := 'Documents from the expert board'; v_cols := array['Title', 'Type', 'Classification', 'Status', 'Started', 'Decided', 'Days to decision', 'Shared as'];
    select jsonb_agg(jsonb_build_array(bc.title, coalesce(bc.doc_type, bc.kind), bc.classification, bc.status, to_char(bc.created_at at time zone 'Asia/Kolkata', 'YYYY-MM-DD'),
        to_char(bc.decided_at at time zone 'Asia/Kolkata', 'YYYY-MM-DD'), round(extract(epoch from bc.decided_at - bc.created_at) / 86400, 1),
        (select r.slug from public.document_releases r where r.case_id = bc.id and r.revoked_at is null)) order by bc.created_at desc) into v_rows
      from public.board_cases bc where bc.company_id = p_company and bc.created_at < t and (bc.created_at >= f or bc.status not in ('approved', 'rejected', 'failed') or bc.decided_at >= f);

  elsif p_report = 'open_questions' then
    v_title := 'Open questions and requests'; v_cols := array['Type', 'Reference', 'Question', 'Department', 'With', 'Due', 'Days overdue'];
    select jsonb_agg(r order by (r ->> 6)::numeric desc nulls last) into v_rows from (
      select jsonb_build_array('Colleague request', c.code, left(c.question_text, 200), d.name, coalesce(up.display_name, '—'), to_char(c.due_at at time zone 'Asia/Kolkata', 'YYYY-MM-DD'),
          case when c.due_at < v_now then floor(extract(epoch from v_now - c.due_at) / 86400) end) r
        from public.clarification_tasks c left join public.departments d on d.id = c.assignee_department_id
        left join public.memberships m on m.id = c.assignee_membership_id left join public.user_profiles up on up.id = m.user_id
       where c.company_id = p_company and c.status in ('open', 'assigned', 'escalated') and (v_whole or c.assignee_department_id = any(v_d))
      union all
      select jsonb_build_array('Leadership question', q.section, left(q.question, 200), null, coalesce(up.display_name, 'Unassigned'), null, null)
        from public.blueprint_open_questions q left join public.memberships m on m.id = q.assigned_to left join public.user_profiles up on up.id = m.user_id
       where q.company_id = p_company and q.status = 'open' and v_whole) z;

  elsif p_report = 'tickets_sla' then
    v_title := 'Tasks and tickets — service levels'; v_cols := array['Kind', 'Priority', 'Opened in period', 'Resolved in period', 'Open now', 'Overdue now', 'Escalated (open)', 'Avg days to resolve'];
    select jsonb_agg(jsonb_build_array(kind, priority, opened, resolved, open_now, overdue, escalated, avg_days) order by kind, priority) into v_rows from (
      select tk.kind, tk.priority,
        count(*) filter (where tk.created_at >= f and tk.created_at < t) opened, count(*) filter (where tk.resolved_at >= f and tk.resolved_at < t) resolved,
        count(*) filter (where tk.status in ('open', 'in_progress', 'waiting')) open_now,
        count(*) filter (where tk.status in ('open', 'in_progress', 'waiting') and tk.due_at < v_now) overdue,
        count(*) filter (where tk.status in ('open', 'in_progress', 'waiting') and tk.escalated_at is not null) escalated,
        round(avg(extract(epoch from tk.resolved_at - tk.created_at) / 86400) filter (where tk.resolved_at >= f and tk.resolved_at < t), 1) avg_days
      from public.tickets tk left join public.memberships am on am.id = tk.assignee_membership_id
      where tk.company_id = p_company and not tk.to_platform and (v_whole or coalesce(tk.assignee_department_id, am.primary_department_id) = any(v_d))
      group by tk.kind, tk.priority) z;

  elsif p_report = 'workload' then
    v_title := 'Workload by person'; v_cols := array['Person', 'Department', 'Open tasks', 'Overdue tasks', 'Open colleague requests', 'Resolved in period'];
    select jsonb_agg(jsonb_build_array(name, dept, o, od, oc, rs) order by od desc, o desc, name) into v_rows from (
      select coalesce(up.display_name, '—') name, d.name dept,
        (select count(*) from public.tickets tk where tk.assignee_membership_id = m.id and tk.status in ('open', 'in_progress', 'waiting')) o,
        (select count(*) from public.tickets tk where tk.assignee_membership_id = m.id and tk.status in ('open', 'in_progress', 'waiting') and tk.due_at < v_now) od,
        (select count(*) from public.clarification_tasks c where c.assignee_membership_id = m.id and c.status in ('open', 'assigned', 'escalated')) oc,
        (select count(*) from public.tickets tk where tk.assignee_membership_id = m.id and tk.resolved_at >= f and tk.resolved_at < t) rs
      from public.memberships m left join public.user_profiles up on up.id = m.user_id left join public.departments d on d.id = m.primary_department_id
      where m.company_id = p_company and m.member_kind = 'human' and m.status = 'active' and (v_whole or m.primary_department_id = any(v_d))) z where o + oc + rs > 0;

  elsif p_report = 'improvements' then
    v_title := 'Improvements and risk actions'; v_cols := array['Reference', 'Title', 'Kind', 'Status', 'Owner', 'Due', 'Opened'];
    select jsonb_agg(r) into v_rows from (
      select jsonb_build_array(tk.code, tk.title, tk.kind, tk.status, coalesce(up.display_name, d.name, '—'), to_char(tk.due_at at time zone 'Asia/Kolkata', 'YYYY-MM-DD'),
          to_char(tk.created_at at time zone 'Asia/Kolkata', 'YYYY-MM-DD')) r
        from public.tickets tk left join public.memberships m on m.id = tk.assignee_membership_id left join public.user_profiles up on up.id = m.user_id
        left join public.departments d on d.id = tk.assignee_department_id
       where tk.company_id = p_company and tk.kind in ('improvement', 'risk_action') and (v_whole or coalesce(tk.assignee_department_id, m.primary_department_id) = any(v_d))
      union all
      select jsonb_build_array('BOARD', bc.title, 'improvement review', bc.status, null, null, to_char(bc.created_at at time zone 'Asia/Kolkata', 'YYYY-MM-DD'))
        from public.board_cases bc where bc.company_id = p_company and bc.kind = 'improvement_review' and v_whole) z;

  elsif p_report = 'ai_usage' then
    v_title := 'AI usage'; v_cols := array['Month', 'Provider', 'Capability', 'Runs', 'Succeeded', 'Failed', 'Success %'];
    select jsonb_agg(jsonb_build_array(mon, provider, capability, n, ok, n - ok, round(100.0 * ok / nullif(n, 0))) order by mon, provider, capability) into v_rows from (
      select to_char(created_at at time zone 'Asia/Kolkata', 'YYYY-MM') mon, provider, capability, count(*) n, count(*) filter (where status = 'succeeded') ok
        from public.ai_runs where company_id = p_company and created_at >= f and created_at < t group by 1, 2, 3) z;

  elsif p_report = 'api_usage' then
    v_title := 'Website and app reads'; v_cols := array['Document / key', 'Route', 'Successful reads', 'Refused', 'Last call'];
    select jsonb_agg(jsonb_build_array(label, endpoint, ok, refused, to_char(last at time zone 'Asia/Kolkata', 'YYYY-MM-DD HH24:MI')) order by ok desc) into v_rows from (
      select coalesce(r.slug, k.name || ' (key)', 'unknown') label, c.endpoint, count(*) filter (where c.status = 200) ok, count(*) filter (where c.status <> 200) refused, max(c.at) last
        from public.document_api_calls c left join public.document_releases r on r.id = c.release_id left join public.company_api_keys k on k.id = c.key_id
       where c.company_id = p_company and c.at >= f and c.at < t group by 1, 2) z;

  elsif p_report = 'billing' then
    v_title := 'Invoices'; v_cols := array['Invoice', 'Period', 'Status', 'Disputed', 'Taxable (INR)', 'GST (INR)', 'Total (INR)', 'Due', 'Paid'];
    select jsonb_agg(jsonb_build_array(i.number, to_char(i.period_start, 'Mon YYYY'), i.status, case when i.disputed then 'Yes' else 'No' end, i.taxable, i.cgst + i.sgst + i.igst, i.total,
        i.due_on, to_char(i.paid_at at time zone 'Asia/Kolkata', 'YYYY-MM-DD')) order by i.period_start desc) into v_rows
      from public.invoices i where i.company_id = p_company and i.status <> 'draft' and i.period_start <= v_to and i.period_end >= v_from;

  elsif p_report = 'projects' then
    v_title := 'Projects'; v_cols := array['Code', 'Project', 'Status', 'Manager', 'Start', 'Target end', 'Milestones done', 'Milestones overdue', 'Days to target'];
    select jsonb_agg(jsonb_build_array(p.code, p.name, p.status, coalesce(up.display_name, '—'), p.starts_on, p.target_end_on,
        (select count(*) filter (where done_at is not null) || ' of ' || count(*) from public.project_milestones pm where pm.project_id = p.id),
        (select count(*) from public.project_milestones pm where pm.project_id = p.id and pm.done_at is null and pm.due_on < v_to),
        p.target_end_on - v_to) order by p.code) into v_rows
      from public.projects p left join public.memberships m on m.id = p.manager_membership_id left join public.user_profiles up on up.id = m.user_id
     where p.company_id = p_company;

  elsif p_report = 'recognition' then
    v_title := 'Contribution and recognition'; v_cols := array['Person', 'Department', 'Interview answers', 'Tasks resolved', 'Colleagues helped', 'Score'];
    select jsonb_agg(jsonb_build_array(name, dept, a, r, h, a + 3 * r + 2 * h) order by a + 3 * r + 2 * h desc, name) into v_rows from (
      select coalesce(up.display_name, '—') name, d.name dept,
        (select count(*) from public.interview_answers x where x.answered_by_membership_id = m.id and x.answered_at >= f and x.answered_at < t) a,
        (select count(*) from public.tickets tk where tk.assignee_membership_id = m.id and tk.resolved_at >= f and tk.resolved_at < t) r,
        (select count(*) from public.clarification_responses cr where cr.responder_membership_id = m.id and cr.created_at >= f and cr.created_at < t) h
      from public.memberships m left join public.user_profiles up on up.id = m.user_id left join public.departments d on d.id = m.primary_department_id
      where m.company_id = p_company and m.member_kind = 'human' and m.status = 'active' and (v_whole or m.primary_department_id = any(v_d))) z where a + r + h > 0;
  else
    raise exception 'PPI_INPUT: unknown report' using errcode = 'P0001';
  end if;
  return jsonb_build_object('title', v_title, 'columns', to_jsonb(v_cols), 'rows', coalesce(v_rows, '[]'::jsonb), 'from', v_from, 'to', v_to,
    'scope', case when v_whole then 'company' else 'departments' end);
end $$;
revoke all on function public.mis_report(uuid, text, date, date) from public, anon;
grant execute on function public.mis_report(uuid, text, date, date) to authenticated;

-- Platform MIS (super admin): portfolio, revenue, receivables, AI pool, support. Figures only.
create or replace function public.platform_mis(p_report text, p_from date default null, p_to date default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_rows jsonb; v_cols text[]; v_title text; f timestamptz; t timestamptz;
        v_from date := coalesce(p_from, date_trunc('month', (now() at time zone 'Asia/Kolkata'))::date - interval '11 months');
        v_to date := coalesce(p_to, (now() at time zone 'Asia/Kolkata')::date);
begin
  if not private.is_platform_admin() then raise exception 'PPI_FORBIDDEN: platform owner only' using errcode = '42501'; end if;
  f := v_from::timestamp at time zone 'Asia/Kolkata'; t := (v_to + 1)::timestamp at time zone 'Asia/Kolkata';
  if p_report = 'portfolio' then
    v_title := 'Company portfolio'; v_cols := array['Company', 'Code', 'Status', 'Package', 'Active people', 'Invited', 'Interviews done', 'Processes', 'Validated', 'Documents approved', 'AI runs (30 d)', 'Last activity'];
    select jsonb_agg(jsonb_build_array(c.name, c.code, c.status, (select pl.name from public.company_subscriptions s join public.billing_plans pl on pl.id = s.plan_id where s.company_id = c.company_id and s.ends_on is null),
        c.members_active, c.members_invited, c.interviews_submitted, c.company_processes, c.validated, c.documents_approved, c.ai_runs_30d,
        to_char(c.last_activity at time zone 'Asia/Kolkata', 'YYYY-MM-DD')) order by c.name) into v_rows
      from public.platform_companies() c where c.code not like 'E2E%';
  elsif p_report = 'revenue' then
    v_title := 'Revenue by month'; v_cols := array['Month', 'Company', 'Invoices', 'Taxable (INR)', 'GST (INR)', 'Total (INR)', 'Paid (INR)', 'Outstanding (INR)'];
    select jsonb_agg(jsonb_build_array(mon, name, n, taxable, gst, total, paid, total - paid) order by mon, name) into v_rows from (
      select to_char(i.period_start, 'YYYY-MM') mon, c.name, count(*) n, sum(i.taxable) taxable, sum(i.cgst + i.sgst + i.igst) gst, sum(i.total) total,
             coalesce(sum(i.total) filter (where i.status = 'paid'), 0) paid
        from public.invoices i join public.companies c on c.id = i.company_id
       where i.status in ('issued', 'paid') and i.period_start <= v_to and i.period_end >= v_from group by 1, 2) z;
  elsif p_report = 'receivables' then
    v_title := 'Receivables'; v_cols := array['Company', 'Invoice', 'Period', 'Total (INR)', 'Issued', 'Due', 'Days overdue', 'Disputed'];
    select jsonb_agg(jsonb_build_array(c.name, i.number, to_char(i.period_start, 'Mon YYYY'), i.total, to_char(i.issued_at at time zone 'Asia/Kolkata', 'YYYY-MM-DD'), i.due_on,
        greatest((now() at time zone 'Asia/Kolkata')::date - i.due_on, 0), case when i.disputed then 'Yes' else 'No' end) order by i.due_on) into v_rows
      from public.invoices i join public.companies c on c.id = i.company_id where i.status = 'issued';
  elsif p_report = 'ai_pool' then
    v_title := 'AI pool utilisation'; v_cols := array['Provider', 'Key', 'Model', 'Status', 'Health', 'Calls today', 'Calls total', 'Last success'];
    select jsonb_agg(jsonb_build_array(k.provider, k.label || ' (…' || k.key_hint || ')', k.model, k.status, k.health,
        case when k.uses_day = (now() at time zone 'Asia/Kolkata')::date then k.uses_today else 0 end, k.uses_total,
        to_char(k.last_success_at at time zone 'Asia/Kolkata', 'YYYY-MM-DD HH24:MI')) order by k.provider, k.label) into v_rows
      from public.ai_pool_keys k where k.health <> 'removed';
  elsif p_report = 'support' then
    v_title := 'Support and billing tickets'; v_cols := array['Company', 'Ticket', 'Kind', 'Title', 'Priority', 'Status', 'Opened', 'Resolved', 'Age / time to resolve (days)'];
    select jsonb_agg(jsonb_build_array(c.name, tk.code, tk.kind, tk.title, tk.priority, tk.status, to_char(tk.created_at at time zone 'Asia/Kolkata', 'YYYY-MM-DD'),
        to_char(tk.resolved_at at time zone 'Asia/Kolkata', 'YYYY-MM-DD'), round(extract(epoch from coalesce(tk.resolved_at, now()) - tk.created_at) / 86400, 1)) order by tk.created_at desc) into v_rows
      from public.tickets tk join public.companies c on c.id = tk.company_id where tk.to_platform and tk.created_at < t and (tk.created_at >= f or tk.status in ('open', 'in_progress', 'waiting'));
  else
    raise exception 'PPI_INPUT: unknown report' using errcode = 'P0001';
  end if;
  return jsonb_build_object('title', v_title, 'columns', to_jsonb(v_cols), 'rows', coalesce(v_rows, '[]'::jsonb), 'from', v_from, 'to', v_to);
end $$;
revoke all on function public.platform_mis(text, date, date) from public, anon;
grant execute on function public.platform_mis(text, date, date) to authenticated;
