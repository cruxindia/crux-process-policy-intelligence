-- PPI-008 Cross-department clarification tasks and disputes (FR-10).
-- AI may flag/summarise; it cannot resolve, decide or erase a position (AC-06). All positions are append-only.

create table public.clarification_tasks (
  id                      uuid not null default gen_random_uuid() primary key,
  company_id              uuid not null references public.companies(id),
  code                    text not null default ('CL-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,8))),
  requester_membership_id uuid not null,
  requesting_department_id uuid not null,
  assignee_department_id  uuid not null,
  assignee_membership_id  uuid,
  process_id              uuid,
  knowledge_record_id     uuid,
  question_text           text not null check (length(trim(question_text)) > 0),
  context_text            text,
  priority                text not null default 'normal' check (priority in ('low','normal','high','urgent')),
  due_at                  timestamptz,
  status                  text not null default 'open'
                          check (status in ('open','assigned','response_submitted','resolved','escalated','disputed','cancelled')),
  outcome_text            text,
  escalation_level        int not null default 0 check (escalation_level >= 0),
  idempotency_key         text,
  resolved_at             timestamptz,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  unique (company_id, id),
  unique (company_id, code),
  unique (company_id, idempotency_key),          -- retries cannot duplicate a task (AC-11)
  foreign key (company_id, requester_membership_id) references public.memberships(company_id, id),
  foreign key (company_id, requesting_department_id) references public.departments(company_id, id),
  foreign key (company_id, assignee_department_id) references public.departments(company_id, id),
  foreign key (company_id, assignee_membership_id) references public.memberships(company_id, id),
  foreign key (company_id, process_id) references public.processes(company_id, id),
  foreign key (company_id, knowledge_record_id) references public.knowledge_records(company_id, id),
  check (status <> 'resolved' or coalesce(length(trim(outcome_text)),0) > 0)
);
create index clarification_tasks_assignee_idx on public.clarification_tasks (company_id, assignee_department_id, status);
create index clarification_tasks_requester_idx on public.clarification_tasks (company_id, requester_membership_id);

create table public.clarification_responses (
  id                      uuid not null default gen_random_uuid() primary key,
  company_id              uuid not null,
  task_id                 uuid not null,
  responder_membership_id uuid not null,
  response_text           text not null check (length(trim(response_text)) > 0),
  evidence_file_id        uuid,
  created_at              timestamptz not null default now(),
  unique (company_id, id),
  foreign key (company_id, task_id) references public.clarification_tasks(company_id, id),
  foreign key (company_id, responder_membership_id) references public.memberships(company_id, id),
  foreign key (company_id, evidence_file_id) references public.evidence_files(company_id, id)
);
create trigger clarification_responses_append_only before update or delete on public.clarification_responses
  for each row execute function private.forbid_mutation();

create table public.disputes (
  id                       uuid not null default gen_random_uuid() primary key,
  company_id               uuid not null references public.companies(id),
  code                     text not null default ('DS-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,8))),
  issue_statement          text not null check (length(trim(issue_statement)) > 0),
  department_id            uuid not null,
  process_id               uuid,
  knowledge_record_id      uuid,
  clarification_task_id    uuid,
  impact_text              text,
  context_differences      text,       -- date/product/client/location/threshold differences
  raised_by_membership_id  uuid not null,
  decision_owner_membership_id uuid not null,
  status                   text not null default 'open' check (status in ('open','under_review','escalated','decided','withdrawn')),
  idempotency_key          text,
  decided_at               timestamptz,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  unique (company_id, id),
  unique (company_id, code),
  unique (company_id, idempotency_key),
  foreign key (company_id, department_id) references public.departments(company_id, id),
  foreign key (company_id, process_id) references public.processes(company_id, id),
  foreign key (company_id, knowledge_record_id) references public.knowledge_records(company_id, id),
  foreign key (company_id, clarification_task_id) references public.clarification_tasks(company_id, id),
  foreign key (company_id, raised_by_membership_id) references public.memberships(company_id, id),
  foreign key (company_id, decision_owner_membership_id) references public.memberships(company_id, id)
);

create table public.dispute_positions (
  id                        uuid not null default gen_random_uuid() primary key,
  company_id                uuid not null,
  dispute_id                uuid not null,
  participant_membership_id uuid not null,
  position_text             text not null check (length(trim(position_text)) > 0),
  context_text              text,
  knowledge_record_id       uuid,
  evidence_file_id          uuid,
  created_at                timestamptz not null default now(),
  unique (company_id, id),
  foreign key (company_id, dispute_id) references public.disputes(company_id, id),
  foreign key (company_id, participant_membership_id) references public.memberships(company_id, id),
  foreign key (company_id, knowledge_record_id) references public.knowledge_records(company_id, id),
  foreign key (company_id, evidence_file_id) references public.evidence_files(company_id, id)
);
create trigger dispute_positions_append_only before update or delete on public.dispute_positions
  for each row execute function private.forbid_mutation();

create table public.dispute_decisions (
  id                       uuid not null default gen_random_uuid() primary key,
  company_id               uuid not null,
  dispute_id               uuid not null,
  decided_by_membership_id uuid not null,
  decision_text            text not null check (length(trim(decision_text)) > 0),
  rationale                text not null check (length(trim(rationale)) > 0),
  resulting_actions        text,
  decided_at               timestamptz not null default now(),
  unique (company_id, id),
  unique (company_id, dispute_id),
  foreign key (company_id, dispute_id) references public.disputes(company_id, id),
  foreign key (company_id, decided_by_membership_id) references public.memberships(company_id, id)
);
create trigger dispute_decisions_append_only before update or delete on public.dispute_decisions
  for each row execute function private.forbid_mutation();

-- Guards ------------------------------------------------------------------------------
create or replace function private.clarification_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_me uuid := private.my_membership(new.company_id);
begin
  if tg_op = 'INSERT' then
    if (select auth.uid()) is not null then new.requester_membership_id := v_me; end if;
    if new.status not in ('open','assigned') then
      raise exception 'PPI_LIFECYCLE: clarification tasks start open or assigned' using errcode = 'P0001';
    end if;
    return new;
  end if;
  if (new.question_text, new.requester_membership_id, new.requesting_department_id, new.created_at)
     is distinct from (old.question_text, old.requester_membership_id, old.requesting_department_id, old.created_at) then
    raise exception 'PPI_IMMUTABLE: the original clarification question cannot be edited' using errcode = 'P0001';
  end if;
  perform private.assert_transition('clarification_task', old.status, new.status, array[
    'open>assigned','open>response_submitted','assigned>response_submitted','escalated>response_submitted',
    'response_submitted>resolved','response_submitted>assigned',
    'open>escalated','assigned>escalated','escalated>assigned',
    'open>disputed','assigned>disputed','response_submitted>disputed',
    'open>cancelled','assigned>cancelled','escalated>cancelled']);
  if new.status = 'resolved' and old.status <> 'resolved' then
    if not private.is_human_actor(new.company_id)
       or not (v_me = old.requester_membership_id
               or private.has_permission(new.company_id, 'clarification.manage', old.requesting_department_id)) then
      raise exception 'PPI_HUMAN_ONLY: only the human requester (or a manager in scope) can resolve' using errcode = 'P0001';
    end if;
    new.resolved_at := now();
  end if;
  if new.status = 'escalated' and old.status <> 'escalated' then new.escalation_level := old.escalation_level + 1; end if;
  -- routing, priority, due date and cancellation belong to the requester or a manager, not the responder
  if ((new.assignee_department_id, new.assignee_membership_id, new.priority, new.due_at)
        is distinct from (old.assignee_department_id, old.assignee_membership_id, old.priority, old.due_at)
      or (new.status = 'cancelled' and old.status <> 'cancelled'))
     and (select auth.uid()) is not null
     and not (v_me = old.requester_membership_id
              or private.has_permission(new.company_id, 'clarification.manage', old.requesting_department_id)
              or private.has_permission(new.company_id, 'clarification.manage', old.assignee_department_id)) then
    raise exception 'PPI_AUTHORITY: only the requester or a clarification manager can re-route or cancel' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger clarification_tasks_guard before insert or update on public.clarification_tasks
  for each row execute function private.clarification_guard();
create trigger clarification_tasks_updated before update on public.clarification_tasks for each row execute function private.set_updated_at();

create or replace function private.can_respond_clarification(p_company uuid, p_task uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.clarification_tasks t where t.company_id = p_company and t.id = p_task
     and (t.assignee_membership_id = private.my_membership(p_company)
          or private.has_permission(p_company, 'clarification.respond', t.assignee_department_id)))
$$;
create or replace function private.can_read_clarification(p_company uuid, p_task uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.clarification_tasks t where t.company_id = p_company and t.id = p_task
     and (t.requester_membership_id = private.my_membership(p_company)
          or private.can_respond_clarification(p_company, p_task)
          or private.has_permission(p_company, 'clarification.manage', t.requesting_department_id)
          or private.has_permission(p_company, 'clarification.manage', t.assignee_department_id)))
$$;

-- A response moves the task to response_submitted.
create or replace function private.clarification_response_after() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.clarification_tasks set status = 'response_submitted'
   where company_id = new.company_id and id = new.task_id and status in ('open','assigned','escalated');
  return null;
end $$;
create or replace function private.clarification_response_before() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.clarification_tasks where company_id = new.company_id and id = new.task_id
             and status in ('resolved','cancelled')) then
    raise exception 'PPI_LIFECYCLE: task is closed' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger clarification_responses_before before insert on public.clarification_responses for each row execute function private.clarification_response_before();
create trigger clarification_responses_after after insert on public.clarification_responses for each row execute function private.clarification_response_after();

create or replace function private.dispute_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if (select auth.uid()) is not null then new.raised_by_membership_id := private.my_membership(new.company_id); end if;
    if new.status <> 'open' then raise exception 'PPI_LIFECYCLE: disputes start open' using errcode = 'P0001'; end if;
    return new;
  end if;
  if (new.issue_statement, new.raised_by_membership_id, new.created_at) is distinct from
     (old.issue_statement, old.raised_by_membership_id, old.created_at) then
    raise exception 'PPI_IMMUTABLE: the dispute statement cannot be edited' using errcode = 'P0001';
  end if;
  perform private.assert_transition('dispute', old.status, new.status, array[
    'open>under_review','open>escalated','under_review>escalated','escalated>under_review',
    'open>decided','under_review>decided','escalated>decided','open>withdrawn','under_review>withdrawn']);
  if new.status = 'decided' and old.status <> 'decided'
     and not exists (select 1 from public.dispute_decisions d where d.company_id = new.company_id and d.dispute_id = new.id) then
    raise exception 'PPI_DECISION: a dispute is decided only by recording a human decision' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger disputes_guard before insert or update on public.disputes for each row execute function private.dispute_guard();
create trigger disputes_updated before update on public.disputes for each row execute function private.set_updated_at();

create or replace function private.dispute_position_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.disputes where company_id = new.company_id and id = new.dispute_id and status in ('decided','withdrawn')) then
    raise exception 'PPI_LIFECYCLE: dispute is closed to new positions' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger dispute_positions_guard before insert on public.dispute_positions for each row execute function private.dispute_position_guard();

create or replace function private.dispute_decision_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_d record; v_me uuid := private.my_membership(new.company_id);
begin
  select * into v_d from public.disputes where company_id = new.company_id and id = new.dispute_id;
  if not private.is_human_actor(new.company_id) or v_me is distinct from new.decided_by_membership_id then
    raise exception 'PPI_HUMAN_ONLY: dispute decisions must be recorded by the deciding human themself' using errcode = 'P0001';
  end if;
  if not (v_me = v_d.decision_owner_membership_id
          or private.has_permission(new.company_id, 'dispute.decide', v_d.department_id, v_d.process_id)) then
    raise exception 'PPI_AUTHORITY: decider is not the decision owner and lacks dispute.decide in scope' using errcode = 'P0001';
  end if;
  if v_d.status in ('decided','withdrawn') then
    raise exception 'PPI_LIFECYCLE: dispute already closed' using errcode = 'P0001';
  end if;
  if (select count(*) from public.dispute_positions p where p.company_id = new.company_id and p.dispute_id = new.dispute_id) < 2 then
    raise exception 'PPI_DECISION: at least two recorded positions are required before deciding' using errcode = 'P0001';
  end if;
  new.decided_at := now();
  return new;
end $$;
create or replace function private.dispute_decision_after() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.disputes set status = 'decided', decided_at = new.decided_at
   where company_id = new.company_id and id = new.dispute_id;
  return null;
end $$;
create trigger dispute_decisions_guard before insert on public.dispute_decisions for each row execute function private.dispute_decision_guard();
create trigger dispute_decisions_after after insert on public.dispute_decisions for each row execute function private.dispute_decision_after();

create or replace function private.can_read_dispute(p_company uuid, p_dispute uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.disputes d where d.company_id = p_company and d.id = p_dispute
     and (private.my_membership(p_company) in (d.raised_by_membership_id, d.decision_owner_membership_id)
          or exists (select 1 from public.dispute_positions p where p.company_id = p_company and p.dispute_id = d.id
                       and p.participant_membership_id = private.my_membership(p_company))
          or private.has_permission(p_company, 'dispute.raise', d.department_id, d.process_id)
          or private.has_permission(p_company, 'dispute.decide', d.department_id, d.process_id)))
$$;
grant execute on all functions in schema private to authenticated, service_role;

create trigger audit_clarification_tasks after insert or update on public.clarification_tasks for each row execute function private.audit_row();
create trigger audit_clarification_responses after insert on public.clarification_responses for each row execute function private.audit_row();
create trigger audit_disputes after insert or update on public.disputes for each row execute function private.audit_row();
create trigger audit_dispute_positions after insert on public.dispute_positions for each row execute function private.audit_row();
create trigger audit_dispute_decisions after insert on public.dispute_decisions for each row execute function private.audit_row();

alter table public.clarification_tasks     enable row level security;
alter table public.clarification_responses enable row level security;
alter table public.disputes                enable row level security;
alter table public.dispute_positions       enable row level security;
alter table public.dispute_decisions       enable row level security;

create policy ct_read on public.clarification_tasks for select to authenticated using ((select private.can_read_clarification(company_id, id)));
create policy ct_insert on public.clarification_tasks for insert to authenticated
  with check ((select private.has_permission(company_id, 'clarification.create', requesting_department_id)));
create policy ct_update on public.clarification_tasks for update to authenticated
  using ((select private.can_read_clarification(company_id, id))) with check ((select private.can_read_clarification(company_id, id)));

create policy cr_read on public.clarification_responses for select to authenticated using ((select private.can_read_clarification(company_id, task_id)));
create policy cr_insert on public.clarification_responses for insert to authenticated
  with check (responder_membership_id = (select private.my_membership(company_id))
              and (select private.can_respond_clarification(company_id, task_id)));

create policy ds_read on public.disputes for select to authenticated using ((select private.can_read_dispute(company_id, id)));
create policy ds_insert on public.disputes for insert to authenticated
  with check ((select private.has_permission(company_id, 'dispute.raise', department_id, process_id)));
create policy ds_update on public.disputes for update to authenticated
  using ((select private.can_read_dispute(company_id, id))) with check ((select private.can_read_dispute(company_id, id)));

create policy dp_read on public.dispute_positions for select to authenticated using ((select private.can_read_dispute(company_id, dispute_id)));
create policy dp_insert on public.dispute_positions for insert to authenticated
  with check (participant_membership_id = (select private.my_membership(company_id))
              and (select private.can_read_dispute(company_id, dispute_id)));

create policy dd_read on public.dispute_decisions for select to authenticated using ((select private.can_read_dispute(company_id, dispute_id)));
create policy dd_insert on public.dispute_decisions for insert to authenticated
  with check ((select private.can_read_dispute(company_id, dispute_id)));
