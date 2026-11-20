-- PPI-037: tasks & tickets engine (blueprint §7B–C, master prompt §6.13, D-093).
-- One ticket = one piece of work with an owner: ticket number, kind, priority, due date (working days), thread, status,
-- reminders on every working day, escalation to the department head after the due date, one digest per person per day.
-- Support and billing tickets go to the platform owner. Clarification requests stay in Requests but count in the digest.

insert into public.permissions (code, description) values
  ('ticket.manage', 'See, assign and close tasks and tickets of the department (or company, with company scope)')
on conflict (code) do nothing;
insert into public.role_permissions (company_id, role_id, permission_code)
select r.company_id, r.id, 'ticket.manage' from public.roles r where r.code in ('COMPANY_ADMIN', 'DISCOVERY_LEAD', 'DEPT_HEAD')
on conflict do nothing;

create sequence public.ticket_no_seq start 1001;

-- Working days (Mon–Fri) in India time.
create or replace function private.add_working_days(p_from timestamptz, p_days int) returns timestamptz
language plpgsql immutable set search_path = '' as $$
declare d date := (p_from at time zone 'Asia/Kolkata')::date; left_ int := greatest(p_days, 0);
begin
  while left_ > 0 loop
    d := d + 1;
    if extract(isodow from d) < 6 then left_ := left_ - 1; end if;
  end loop;
  return (d + time '18:00') at time zone 'Asia/Kolkata';   -- due by end of that working day
end $$;

create table public.tickets (
  id                         uuid not null default gen_random_uuid(),
  company_id                 uuid not null references public.companies(id),
  code                       text not null default ('TKT-' || nextval('public.ticket_no_seq')::text),
  kind                       text not null check (kind in ('action','review','approval','improvement','risk_action','question','support','billing_dispute')),
  title                      text not null check (length(trim(title)) between 3 and 200),
  description                text check (description is null or length(description) <= 8000),
  priority                   text not null default 'normal' check (priority in ('critical','high','normal','low')),
  status                     text not null default 'open' check (status in ('open','in_progress','waiting','resolved','closed','cancelled')),
  to_platform                boolean not null default false,          -- support / billing: handled by the platform owner
  requester_membership_id    uuid,
  assignee_membership_id     uuid,
  assignee_department_id     uuid,
  due_at                     timestamptz,
  related_type               text check (related_type is null or related_type ~ '^[a-z_]{2,40}$'),
  related_id                 uuid,
  related_label              text check (related_label is null or length(related_label) <= 200),
  reminder_count             int not null default 0,
  last_reminded_on           date,
  escalated_at               timestamptz,
  escalated_to_membership_id uuid,
  resolution                 text check (resolution is null or length(resolution) <= 4000),
  resolved_at                timestamptz,
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now(),
  primary key (id), unique (company_id, id), unique (code),
  foreign key (company_id, requester_membership_id) references public.memberships(company_id, id),
  foreign key (company_id, assignee_membership_id) references public.memberships(company_id, id),
  foreign key (company_id, assignee_department_id) references public.departments(company_id, id),
  foreign key (company_id, escalated_to_membership_id) references public.memberships(company_id, id),
  check (to_platform = (kind in ('support', 'billing_dispute'))),
  check (status not in ('resolved', 'closed') or resolution is not null)
);
create index tickets_assignee_idx on public.tickets (company_id, assignee_membership_id) where status in ('open','in_progress','waiting');
create index tickets_requester_idx on public.tickets (company_id, requester_membership_id);
create index tickets_dept_idx on public.tickets (company_id, assignee_department_id);
create index tickets_escalated_idx on public.tickets (company_id, escalated_to_membership_id);
create index tickets_platform_idx on public.tickets (to_platform, status) where to_platform;
create index tickets_related_idx on public.tickets (company_id, related_type, related_id);
create trigger tickets_updated before update on public.tickets for each row execute function private.set_updated_at();
create trigger audit_tickets after insert or update on public.tickets for each row execute function private.audit_row();

create table public.ticket_comments (
  id                  uuid not null default gen_random_uuid(),
  company_id          uuid not null references public.companies(id),
  ticket_id           uuid not null,
  author_membership_id uuid,
  author_is_platform  boolean not null default false,
  body                text not null check (length(trim(body)) between 1 and 4000),
  kind                text not null default 'comment' check (kind in ('comment', 'status', 'system')),
  created_at          timestamptz not null default now(),
  primary key (id), unique (company_id, id),
  foreign key (company_id, ticket_id) references public.tickets(company_id, id),
  foreign key (company_id, author_membership_id) references public.memberships(company_id, id),
  check (author_is_platform or author_membership_id is not null or kind = 'system')
);
create index ticket_comments_ticket_idx on public.ticket_comments (company_id, ticket_id, created_at);
create index ticket_comments_author_idx on public.ticket_comments (company_id, author_membership_id);
create trigger ticket_comments_append_only before update or delete on public.ticket_comments for each row execute function private.forbid_mutation();

-- Who may see a ticket.
create or replace function private.can_read_ticket(p_company uuid, p_ticket uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.tickets t where t.company_id = p_company and t.id = p_ticket and (
     t.requester_membership_id = private.my_membership(p_company)
     or t.assignee_membership_id = private.my_membership(p_company)
     or t.escalated_to_membership_id = private.my_membership(p_company)
     or private.has_permission(p_company, 'ticket.manage', t.assignee_department_id)
     or (t.to_platform and (private.is_platform_admin() or private.has_permission(p_company, 'org.manage')))))
$$;
revoke all on function private.can_read_ticket(uuid, uuid) from public, anon;
grant execute on function private.can_read_ticket(uuid, uuid) to authenticated;

alter table public.tickets enable row level security;
alter table public.ticket_comments enable row level security;
create policy tickets_read on public.tickets for select to authenticated using ((select private.can_read_ticket(company_id, id)));
create policy ticket_comments_read on public.ticket_comments for select to authenticated using ((select private.can_read_ticket(company_id, ticket_id)));
revoke insert, update, delete, truncate, references, trigger on public.tickets, public.ticket_comments from authenticated, anon;
grant select on public.tickets, public.ticket_comments to authenticated;

create or replace function private.ticket_notify(p_company uuid, p_member uuid, p_ticket uuid, p_title text, p_key text) returns void
language sql security definer set search_path = '' as $$
  insert into public.notifications (company_id, recipient_membership_id, kind, title, object_type, object_id, dedupe_key)
  select p_company, p_member, 'ticket', left(p_title, 300), 'ticket', p_ticket, p_key where p_member is not null
  on conflict do nothing
$$;

create or replace function public.ticket_create(p_company uuid, p_kind text, p_title text, p_description text default null,
  p_priority text default 'normal', p_assignee uuid default null, p_department uuid default null, p_due timestamptz default null,
  p_related_type text default null, p_related_id uuid default null, p_related_label text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_mid uuid := private.my_membership(p_company); v_id uuid := gen_random_uuid(); v_dept uuid := p_department; v_code text;
        v_platform boolean := p_kind in ('support', 'billing_dispute');
begin
  if v_mid is null or not private.is_human_actor(p_company) then raise exception 'PPI_FORBIDDEN: members only' using errcode = '42501'; end if;
  if p_kind is null or p_kind not in ('action','review','approval','improvement','risk_action','question','support','billing_dispute') then
    raise exception 'PPI_INPUT: unknown kind of task' using errcode = 'P0001'; end if;
  if p_priority not in ('critical','high','normal','low') then raise exception 'PPI_INPUT: unknown priority' using errcode = 'P0001'; end if;
  if v_platform and (p_assignee is not null or p_department is not null) then
    raise exception 'PPI_INPUT: support and billing tickets go to the platform team, not to a colleague' using errcode = 'P0001'; end if;
  if p_kind = 'billing_dispute' and not private.has_permission(p_company, 'org.manage') then
    raise exception 'PPI_FORBIDDEN: only a company administrator can dispute an invoice' using errcode = '42501'; end if;
  if not v_platform then
    if p_assignee is null and p_department is null then raise exception 'PPI_INPUT: choose who should do it (a person or a department)' using errcode = 'P0001'; end if;
    if p_assignee is not null then
      if not exists (select 1 from public.memberships where company_id = p_company and id = p_assignee and status in ('active', 'invited')) then
        raise exception 'PPI_INPUT: that person is not a member' using errcode = 'P0001'; end if;
      -- Giving work to someone else is a managerial act, except within one's own department (peer request) or to oneself.
      if p_assignee <> v_mid and not private.has_permission_anywhere(p_company, 'ticket.manage')
         and not exists (select 1 from public.memberships a join public.memberships b on b.company_id = a.company_id
                          where a.company_id = p_company and a.id = v_mid and b.id = p_assignee and a.primary_department_id = b.primary_department_id) then
        raise exception 'PPI_FORBIDDEN: you can assign tasks to yourself or to colleagues in your department; ask your manager for others' using errcode = '42501'; end if;
      select coalesce(v_dept, primary_department_id) into v_dept from public.memberships where company_id = p_company and id = p_assignee;
    end if;
  end if;
  insert into public.tickets (id, company_id, kind, title, description, priority, to_platform, requester_membership_id, assignee_membership_id,
    assignee_department_id, due_at, related_type, related_id, related_label)
  values (v_id, p_company, p_kind, trim(p_title), nullif(trim(coalesce(p_description, '')), ''), p_priority, v_platform, v_mid, p_assignee, v_dept,
    coalesce(p_due, private.add_working_days(now(), case p_priority when 'critical' then 1 when 'high' then 2 when 'normal' then 5 else 10 end)),
    p_related_type, p_related_id, left(p_related_label, 200))
  returning code into v_code;
  perform private.ticket_notify(p_company, p_assignee, v_id, v_code || ' assigned to you: ' || trim(p_title), 'ticket:' || v_id || ':assigned');
  return v_id;
end $$;

create or replace function public.ticket_comment(p_company uuid, p_ticket uuid, p_body text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_mid uuid := private.my_membership(p_company); t record; v_id uuid := gen_random_uuid(); v_platform boolean := false;
begin
  select * into t from public.tickets where company_id = p_company and id = p_ticket;
  if t.id is null or not private.can_read_ticket(p_company, p_ticket) then raise exception 'PPI_FORBIDDEN: not your ticket' using errcode = '42501'; end if;
  if v_mid is null then
    if not (t.to_platform and private.is_platform_admin()) then raise exception 'PPI_FORBIDDEN: members only' using errcode = '42501'; end if;
    v_platform := true;
  end if;
  insert into public.ticket_comments (id, company_id, ticket_id, author_membership_id, author_is_platform, body)
  values (v_id, p_company, p_ticket, v_mid, v_platform, trim(p_body));
  -- the other side hears about it
  if v_platform or v_mid is distinct from t.requester_membership_id then
    perform private.ticket_notify(p_company, t.requester_membership_id, p_ticket, t.code || ': new reply', 'ticket:' || p_ticket || ':c:' || v_id);
  end if;
  if not v_platform and v_mid is distinct from t.assignee_membership_id then
    perform private.ticket_notify(p_company, t.assignee_membership_id, p_ticket, t.code || ': new comment', 'ticket:' || p_ticket || ':c:' || v_id || ':a');
  end if;
  return v_id;
end $$;

-- Status changes: the assignee (or the platform owner for platform tickets) works and resolves; the requester may also close or
-- cancel their own ticket; managers in scope may do anything incl. re-assign. Resolving needs a resolution.
create or replace function public.ticket_set_status(p_company uuid, p_ticket uuid, p_status text, p_resolution text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare v_mid uuid := private.my_membership(p_company); t record; v_mgr boolean; v_platform boolean;
begin
  select * into t from public.tickets where company_id = p_company and id = p_ticket;
  if t.id is null or not private.can_read_ticket(p_company, p_ticket) then raise exception 'PPI_FORBIDDEN: not your ticket' using errcode = '42501'; end if;
  if p_status not in ('open','in_progress','waiting','resolved','closed','cancelled') then raise exception 'PPI_INPUT: unknown status' using errcode = 'P0001'; end if;
  v_platform := t.to_platform and private.is_platform_admin();
  v_mgr := v_platform or (v_mid is not null and private.has_permission(p_company, 'ticket.manage', t.assignee_department_id));
  if not (v_mgr
          or (v_mid = t.assignee_membership_id and p_status in ('open','in_progress','waiting','resolved'))
          or (v_mid = t.requester_membership_id and p_status in ('open','closed','cancelled'))) then
    raise exception 'PPI_FORBIDDEN: you cannot change this ticket to %', p_status using errcode = '42501'; end if;
  if t.to_platform and not v_platform and p_status in ('in_progress','waiting','resolved') then
    raise exception 'PPI_FORBIDDEN: the platform team updates support tickets' using errcode = '42501'; end if;
  if p_status in ('resolved','closed') and coalesce(length(trim(coalesce(p_resolution, t.resolution))), 0) < 3 then
    raise exception 'PPI_INPUT: say how it was resolved' using errcode = 'P0001'; end if;
  update public.tickets set status = p_status,
    resolution = case when p_status in ('resolved','closed') then coalesce(nullif(trim(coalesce(p_resolution, '')), ''), resolution) else resolution end,
    resolved_at = case when p_status in ('resolved','closed') then coalesce(resolved_at, now()) when p_status in ('open','in_progress','waiting') then null else resolved_at end
  where company_id = p_company and id = p_ticket;
  insert into public.ticket_comments (company_id, ticket_id, author_membership_id, author_is_platform, body, kind)
  values (p_company, p_ticket, v_mid, v_mid is null, 'Status → ' || replace(p_status, '_', ' ') || coalesce(': ' || nullif(trim(coalesce(p_resolution, '')), ''), ''), 'status');
  if p_status in ('resolved', 'closed') then
    perform private.ticket_notify(p_company, t.requester_membership_id, p_ticket, t.code || ' resolved: ' || t.title, 'ticket:' || p_ticket || ':resolved:' || now()::date);
  end if;
end $$;

create or replace function public.ticket_assign(p_company uuid, p_ticket uuid, p_assignee uuid, p_due timestamptz default null, p_priority text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare t record; v_dept uuid;
begin
  select * into t from public.tickets where company_id = p_company and id = p_ticket;
  if t.id is null then raise exception 'PPI_INPUT: ticket not found' using errcode = 'P0001'; end if;
  if t.to_platform then raise exception 'PPI_INPUT: support tickets are handled by the platform team' using errcode = 'P0001'; end if;
  if not private.has_permission(p_company, 'ticket.manage', t.assignee_department_id) then
    raise exception 'PPI_FORBIDDEN: only a manager of this department can re-assign' using errcode = '42501'; end if;
  if p_priority is not null and p_priority not in ('critical','high','normal','low') then raise exception 'PPI_INPUT: unknown priority' using errcode = 'P0001'; end if;
  select primary_department_id into v_dept from public.memberships where company_id = p_company and id = p_assignee and status in ('active','invited');
  if not found then raise exception 'PPI_INPUT: that person is not a member' using errcode = 'P0001'; end if;
  update public.tickets set assignee_membership_id = p_assignee, assignee_department_id = coalesce(v_dept, assignee_department_id),
    due_at = coalesce(p_due, due_at), priority = coalesce(p_priority, priority), reminder_count = 0, escalated_at = null, escalated_to_membership_id = null
  where company_id = p_company and id = p_ticket;
  insert into public.ticket_comments (company_id, ticket_id, author_membership_id, body, kind)
  values (p_company, p_ticket, private.my_membership(p_company), 'Re-assigned', 'status');
  perform private.ticket_notify(p_company, p_assignee, p_ticket, t.code || ' assigned to you: ' || t.title, 'ticket:' || p_ticket || ':assigned:' || p_assignee);
end $$;

-- Daily run (working days, from pg_cron on the hosted project): reminder numbers, escalation after the due date, and ONE
-- digest notification per person per day covering their open tickets and open clarification requests.
create or replace function private.run_ticket_reminders(p_now timestamptz default now()) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_day date := (p_now at time zone 'Asia/Kolkata')::date; v_rem int := 0; v_esc int := 0; v_dig int := 0; r record; v_to uuid;
begin
  if extract(isodow from v_day) >= 6 then return jsonb_build_object('skipped', 'weekend'); end if;
  -- reminders: every open ticket older than today that has not been reminded today
  update public.tickets set reminder_count = reminder_count + 1, last_reminded_on = v_day
   where status in ('open','in_progress','waiting') and not to_platform and assignee_membership_id is not null
     and (created_at at time zone 'Asia/Kolkata')::date < v_day and last_reminded_on is distinct from v_day;
  get diagnostics v_rem = row_count;
  -- escalation: overdue and not yet escalated → the department head of the assignee's department (else a company admin)
  for r in select t.id, t.company_id, t.code, t.title, t.assignee_department_id from public.tickets t
            where t.status in ('open','in_progress','waiting') and not t.to_platform and t.due_at < p_now and t.escalated_at is null loop
    update public.tickets set escalated_at = p_now, escalated_to_membership_id = (
      select ra.membership_id from public.role_assignments ra join public.roles ro on ro.id = ra.role_id
        join public.memberships m on m.id = ra.membership_id and m.status = 'active'
       where ra.company_id = r.company_id and ((ro.code = 'DEPT_HEAD' and ra.scope_department_id = r.assignee_department_id) or ro.code = 'COMPANY_ADMIN')
       order by (ro.code = 'DEPT_HEAD') desc, m.created_at limit 1)
     where id = r.id
     returning escalated_to_membership_id into v_to;
    perform private.ticket_notify(r.company_id, v_to, r.id, 'Escalated (overdue): ' || r.code || ' ' || r.title, 'ticket:' || r.id || ':escalated');
    v_esc := v_esc + 1;
  end loop;
  -- one digest per person per day
  for r in
    with open_t as (select company_id, assignee_membership_id m, count(*) n, count(*) filter (where due_at < p_now) od, max(reminder_count) rc
                      from public.tickets where status in ('open','in_progress','waiting') and not to_platform and assignee_membership_id is not null
                     group by 1, 2),
         open_c as (select company_id, assignee_membership_id m, count(*) n, count(*) filter (where due_at < p_now) od
                      from public.clarification_tasks where status in ('open','assigned','escalated') and assignee_membership_id is not null group by 1, 2)
    select coalesce(t.company_id, c.company_id) company_id, coalesce(t.m, c.m) m, coalesce(t.n, 0) tn, coalesce(t.od, 0) tod, coalesce(t.rc, 0) rc,
           coalesce(c.n, 0) cn, coalesce(c.od, 0) cod
      from open_t t full join open_c c on c.company_id = t.company_id and c.m = t.m
  loop
    insert into public.notifications (company_id, recipient_membership_id, kind, title, object_type, dedupe_key)
    values (r.company_id, r.m, 'digest',
      'Daily summary: ' || (r.tn + r.cn) || ' open item' || case when r.tn + r.cn = 1 then '' else 's' end
        || case when r.tod + r.cod > 0 then ' (' || (r.tod + r.cod) || ' overdue)' else '' end
        || case when r.rc > 0 then ' · reminder ' || r.rc else '' end,
      'digest', 'digest:' || v_day)
    on conflict do nothing;
    if found then v_dig := v_dig + 1; end if;
  end loop;
  return jsonb_build_object('day', v_day, 'reminded', v_rem, 'escalated', v_esc, 'digests', v_dig);
end $$;
revoke all on function private.run_ticket_reminders(timestamptz) from public, anon, authenticated;

-- Platform owner: support and billing tickets across companies.
create or replace function public.platform_tickets(p_open_only boolean default true)
returns table (ticket_id uuid, company_id uuid, company_name text, code text, kind text, title text, priority text, status text,
               created_at timestamptz, updated_at timestamptz, requester text, comments int)
language sql stable security definer set search_path = '' as $$
  select t.id, t.company_id, c.name, t.code, t.kind, t.title, t.priority, t.status, t.created_at, t.updated_at,
         coalesce(p.display_name, 'member'), (select count(*) from public.ticket_comments x where x.ticket_id = t.id)::int
    from public.tickets t join public.companies c on c.id = t.company_id
    left join public.memberships m on m.company_id = t.company_id and m.id = t.requester_membership_id
    left join public.user_profiles p on p.id = m.user_id
   where t.to_platform and private.is_platform_admin() and (not p_open_only or t.status in ('open','in_progress','waiting'))
   order by (t.status in ('open','in_progress','waiting')) desc, case t.priority when 'critical' then 0 when 'high' then 1 when 'normal' then 2 else 3 end, t.created_at
$$;

revoke all on function public.ticket_create(uuid, text, text, text, text, uuid, uuid, timestamptz, text, uuid, text),
  public.ticket_comment(uuid, uuid, text), public.ticket_set_status(uuid, uuid, text, text), public.ticket_assign(uuid, uuid, uuid, timestamptz, text),
  public.platform_tickets(boolean) from public, anon;
grant execute on function public.ticket_create(uuid, text, text, text, text, uuid, uuid, timestamptz, text, uuid, text),
  public.ticket_comment(uuid, uuid, text), public.ticket_set_status(uuid, uuid, text, text), public.ticket_assign(uuid, uuid, uuid, timestamptz, text),
  public.platform_tickets(boolean) to authenticated;
