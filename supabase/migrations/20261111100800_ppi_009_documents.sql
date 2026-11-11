-- PPI-009 Controlled documents, configurable approval routes, immutable publication, acknowledgement (FR-14).
-- Approvals bind to the content hash: editing content after approval invalidates earlier approvals.

create table public.document_types (
  id                    uuid not null default gen_random_uuid() primary key,
  company_id            uuid not null references public.companies(id),
  code                  text not null,
  name                  text not null,
  default_review_months int check (default_review_months > 0),
  unique (company_id, id),
  unique (company_id, code)
);

create table public.approval_routes (
  id                 uuid not null default gen_random_uuid() primary key,
  company_id         uuid not null references public.companies(id),
  code               text not null,
  version            int  not null default 1,
  name               text not null,
  document_type_id   uuid,
  status             text not null default 'draft' check (status in ('draft','active','retired')),
  segregate_author   boolean not null default true,   -- author may not approve own document
  distinct_approvers boolean not null default true,   -- one person cannot satisfy two steps
  created_at         timestamptz not null default now(),
  unique (company_id, id),
  unique (company_id, code, version),
  foreign key (company_id, document_type_id) references public.document_types(company_id, id)
);

create table public.approval_route_steps (
  company_id          uuid not null,
  route_id            uuid not null,
  step_no             int  not null check (step_no > 0),
  step_kind           text not null check (step_kind in ('owner_review','functional_review','risk_review','legal_review','management_approval')),
  required_permission text not null references public.permissions(code),
  required_approvals  int  not null default 1 check (required_approvals > 0),
  primary key (company_id, route_id, step_no),
  foreign key (company_id, route_id) references public.approval_routes(company_id, id)
);

create or replace function private.route_steps_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.approval_routes r where r.company_id = coalesce(new.company_id, old.company_id)
               and r.id = coalesce(new.route_id, old.route_id) and r.status <> 'draft') then
    raise exception 'PPI_IMMUTABLE: steps of an active/retired route cannot change; create a new route version' using errcode = 'P0001';
  end if;
  return coalesce(new, old);
end $$;
create trigger approval_route_steps_guard before insert or update or delete on public.approval_route_steps
  for each row execute function private.route_steps_guard();

create table public.documents (
  id                  uuid not null default gen_random_uuid() primary key,
  company_id          uuid not null references public.companies(id),
  doc_code            text not null,
  title               text not null,
  document_type_id    uuid not null,
  owner_membership_id uuid not null,
  department_id       uuid not null,
  process_id          uuid,
  classification      text not null default 'internal' check (classification in ('public','internal','confidential','restricted')),
  status              text not null default 'active' check (status in ('active','withdrawn')),
  created_at          timestamptz not null default now(),
  unique (company_id, id),
  unique (company_id, doc_code),
  foreign key (company_id, document_type_id) references public.document_types(company_id, id),
  foreign key (company_id, owner_membership_id) references public.memberships(company_id, id),
  foreign key (company_id, department_id) references public.departments(company_id, id),
  foreign key (company_id, process_id) references public.processes(company_id, id)
);

create table public.document_versions (
  id                       uuid not null default gen_random_uuid() primary key,
  company_id               uuid not null,
  document_id              uuid not null,
  version_no               int  not null check (version_no > 0),
  status                   text not null default 'draft'
                           check (status in ('draft','in_review','approved','published','superseded','withdrawn','rejected')),
  body_markdown            text not null default '',
  change_summary           text,
  route_id                 uuid,
  content_sha256           text,
  author_membership_id     uuid,
  supersedes_version_id    uuid,
  effective_date           date,
  review_due_date          date,
  submitted_at             timestamptz,
  approved_at              timestamptz,
  published_at             timestamptz,
  published_by_membership_id uuid,
  is_emergency             boolean not null default false,
  emergency_reason         text,
  retrospective_review_due date,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  unique (company_id, id),
  unique (company_id, document_id, version_no),
  foreign key (company_id, document_id) references public.documents(company_id, id),
  foreign key (company_id, route_id) references public.approval_routes(company_id, id),
  foreign key (company_id, author_membership_id) references public.memberships(company_id, id),
  foreign key (company_id, supersedes_version_id) references public.document_versions(company_id, id),
  foreign key (company_id, published_by_membership_id) references public.memberships(company_id, id),
  check (not is_emergency or coalesce(length(trim(emergency_reason)),0) > 0),
  check (review_due_date is null or effective_date is null or review_due_date > effective_date)
);
-- one published version per document at a time (also blocks duplicate publication on retry, AC-11)
create unique index document_versions_one_published on public.document_versions (company_id, document_id) where status = 'published';

create table public.document_version_sources (
  id                  uuid not null default gen_random_uuid() primary key,
  company_id          uuid not null,
  version_id          uuid not null,
  knowledge_record_id uuid,
  process_version_id  uuid,
  evidence_file_id    uuid,
  note                text,
  foreign key (company_id, version_id) references public.document_versions(company_id, id),
  foreign key (company_id, knowledge_record_id) references public.knowledge_records(company_id, id),
  foreign key (company_id, process_version_id) references public.process_versions(company_id, id),
  foreign key (company_id, evidence_file_id) references public.evidence_files(company_id, id),
  check (num_nonnulls(knowledge_record_id, process_version_id, evidence_file_id) = 1)
);
create index document_version_sources_version_idx on public.document_version_sources (company_id, version_id);

create table public.approval_decisions (
  id                       uuid not null default gen_random_uuid() primary key,
  company_id               uuid not null,
  version_id               uuid not null,
  step_no                  int  not null,
  decided_by_membership_id uuid not null,
  decision                 text not null check (decision in ('approved','rejected','changes_requested')),
  comment                  text,
  content_sha256           text,
  decided_at               timestamptz not null default now(),
  unique (company_id, id),
  foreign key (company_id, version_id) references public.document_versions(company_id, id),
  foreign key (company_id, decided_by_membership_id) references public.memberships(company_id, id),
  check (decision = 'approved' or coalesce(length(trim(comment)),0) > 0)
);
create index approval_decisions_version_idx on public.approval_decisions (company_id, version_id, step_no);
create trigger approval_decisions_append_only before update or delete on public.approval_decisions
  for each row execute function private.forbid_mutation();

-- Delivery is tracked separately from acknowledgement.
create table public.document_distributions (
  id            uuid not null default gen_random_uuid() primary key,
  company_id    uuid not null,
  version_id    uuid not null,
  membership_id uuid not null,
  channel       text not null default 'in_app' check (channel in ('in_app','email')),
  delivered_at  timestamptz not null default now(),
  unique (company_id, version_id, membership_id, channel),
  foreign key (company_id, version_id) references public.document_versions(company_id, id),
  foreign key (company_id, membership_id) references public.memberships(company_id, id)
);

create table public.document_acknowledgements (
  id              uuid not null default gen_random_uuid() primary key,
  company_id      uuid not null,
  version_id      uuid not null,
  membership_id   uuid not null,
  acknowledged_at timestamptz not null default now(),
  unique (company_id, version_id, membership_id),
  foreign key (company_id, version_id) references public.document_versions(company_id, id),
  foreign key (company_id, membership_id) references public.memberships(company_id, id)
);
create trigger document_acknowledgements_append_only before update or delete on public.document_acknowledgements
  for each row execute function private.forbid_mutation();

create table public.document_change_requests (
  id                      uuid not null default gen_random_uuid() primary key,
  company_id              uuid not null,
  document_id             uuid not null,
  requested_by_membership_id uuid not null,
  reason                  text not null check (length(trim(reason)) > 0),
  status                  text not null default 'open' check (status in ('open','accepted','rejected','implemented')),
  created_at              timestamptz not null default now(),
  foreign key (company_id, document_id) references public.documents(company_id, id),
  foreign key (company_id, requested_by_membership_id) references public.memberships(company_id, id)
);

-- Route evaluation ------------------------------------------------------------------
create or replace function private.document_scope(p_company uuid, p_version uuid,
  out department_id uuid, out process_id uuid, out classification text, out document_id uuid)
language sql stable security definer set search_path = '' as $$
  select d.department_id, d.process_id, d.classification, d.id
    from public.document_versions v join public.documents d on d.company_id = v.company_id and d.id = v.document_id
   where v.company_id = p_company and v.id = p_version
$$;

-- Approved decisions per step for the CURRENT content hash.
create or replace function private.step_approvals(p_company uuid, p_version uuid, p_step int) returns int
language sql stable security definer set search_path = '' as $$
  select count(distinct a.decided_by_membership_id)::int
    from public.approval_decisions a join public.document_versions v on v.company_id = a.company_id and v.id = a.version_id
   where a.company_id = p_company and a.version_id = p_version and a.step_no = p_step
     and a.decision = 'approved' and a.content_sha256 = v.content_sha256
$$;

create or replace function private.route_complete(p_company uuid, p_version uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.approval_route_steps s join public.document_versions v
                   on v.company_id = s.company_id and v.route_id = s.route_id
                  where v.company_id = p_company and v.id = p_version)
     and not exists (
       select 1 from public.approval_route_steps s join public.document_versions v
         on v.company_id = s.company_id and v.route_id = s.route_id
        where v.company_id = p_company and v.id = p_version
          and private.step_approvals(p_company, p_version, s.step_no) < s.required_approvals)
$$;

-- Version guard ----------------------------------------------------------------------
create or replace function private.document_version_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_scope record; v_me uuid := private.my_membership(new.company_id);
begin
  select * into v_scope from private.document_scope(new.company_id, new.id);
  if tg_op = 'INSERT' then
    if new.status <> 'draft' then raise exception 'PPI_LIFECYCLE: document versions start as draft' using errcode = 'P0001'; end if;
    if (select auth.uid()) is not null then new.author_membership_id := v_me; end if;
    select coalesce(max(version_no), 0) + 1 into new.version_no from public.document_versions
     where company_id = new.company_id and document_id = new.document_id;
    new.content_sha256 := null; new.published_at := null; new.published_by_membership_id := null;
    return new;
  end if;

  -- Content and route are frozen once a version leaves draft.
  if old.status <> 'draft' and (new.body_markdown, new.route_id, new.document_id, new.version_no, new.author_membership_id, new.change_summary)
                     is distinct from (old.body_markdown, old.route_id, old.document_id, old.version_no, old.author_membership_id, old.change_summary) then
    raise exception 'PPI_IMMUTABLE: % document version content cannot change; create a new version', old.status using errcode = 'P0001';
  end if;
  if old.status in ('published','superseded','withdrawn')
     and (new.effective_date, new.review_due_date, new.published_at, new.published_by_membership_id, new.is_emergency, new.content_sha256)
         is distinct from (old.effective_date, old.review_due_date, old.published_at, old.published_by_membership_id, old.is_emergency, old.content_sha256) then
    raise exception 'PPI_IMMUTABLE: published version metadata cannot change' using errcode = 'P0001';
  end if;

  perform private.assert_transition('document_version', old.status, new.status, array[
    'draft>in_review','in_review>draft','in_review>approved','in_review>rejected',
    'approved>published','published>superseded','published>withdrawn','approved>withdrawn',
    'draft>published','in_review>published']);   -- last two: emergency only (checked below)

  if new.status = 'in_review' and old.status = 'draft' then
    if new.route_id is null or not exists (select 1 from public.approval_routes r where r.company_id = new.company_id and r.id = new.route_id and r.status = 'active') then
      raise exception 'PPI_ROUTE: an active approval route is required before review' using errcode = 'P0001';
    end if;
    if not exists (select 1 from public.document_version_sources s where s.company_id = new.company_id and s.version_id = new.id) then
      raise exception 'PPI_PROVENANCE: a document needs at least one permitted source record before review' using errcode = 'P0001';
    end if;
    new.content_sha256 := encode(extensions.digest(new.body_markdown, 'sha256'), 'hex');
    new.submitted_at := now();
  end if;
  if new.status = 'draft' and old.status = 'in_review' then new.content_sha256 := null; end if;

  if new.status = 'approved' and old.status <> 'approved' then
    if not private.route_complete(new.company_id, new.id) then
      raise exception 'PPI_APPROVAL: not every required route step has been approved' using errcode = 'P0001';
    end if;
    new.approved_at := now();
  end if;

  if new.status = 'published' and old.status <> 'published' then
    if not private.is_human_actor(new.company_id) then
      raise exception 'PPI_HUMAN_ONLY: publication requires a human publisher' using errcode = 'P0001';
    end if;
    if old.status = 'approved' then
      if not private.has_permission(new.company_id, 'document.publish', v_scope.department_id, v_scope.process_id) then
        raise exception 'PPI_AUTHORITY: document.publish required in scope' using errcode = 'P0001';
      end if;
      if not private.route_complete(new.company_id, new.id) then
        raise exception 'PPI_APPROVAL: approvals no longer match content' using errcode = 'P0001';
      end if;
    else
      -- emergency path from draft/in_review
      if not new.is_emergency or coalesce(length(trim(new.emergency_reason)),0) = 0
         or not private.has_permission(new.company_id, 'document.emergency_publish', v_scope.department_id, v_scope.process_id) then
        raise exception 'PPI_APPROVAL: a document cannot publish before all required approvals (emergency publication needs authority and reason)' using errcode = 'P0001';
      end if;
      new.content_sha256 := encode(extensions.digest(new.body_markdown, 'sha256'), 'hex');
      new.retrospective_review_due := current_date + 14;
    end if;
    new.published_at := now();
    new.published_by_membership_id := v_me;
    new.effective_date := coalesce(new.effective_date, current_date);
    -- previous published version of this document becomes superseded
    update public.document_versions set status = 'superseded'
     where company_id = new.company_id and document_id = new.document_id and status = 'published' and id <> new.id;
    new.supersedes_version_id := coalesce(new.supersedes_version_id,
      (select id from public.document_versions where company_id = new.company_id and document_id = new.document_id
          and status = 'superseded' and id <> new.id order by version_no desc limit 1));
  end if;
  return new;
end $$;
create trigger document_versions_guard before insert or update on public.document_versions
  for each row execute function private.document_version_guard();
create trigger document_versions_updated before update on public.document_versions for each row execute function private.set_updated_at();
create trigger document_versions_no_delete before delete on public.document_versions for each row execute function private.forbid_mutation();

create or replace function private.document_source_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.document_versions v where v.company_id = coalesce(new.company_id, old.company_id)
             and v.id = coalesce(new.version_id, old.version_id) and v.status <> 'draft') then
    raise exception 'PPI_IMMUTABLE: sources of a non-draft document version cannot change' using errcode = 'P0001';
  end if;
  return coalesce(new, old);
end $$;
create trigger document_version_sources_guard before insert or update or delete on public.document_version_sources
  for each row execute function private.document_source_guard();

-- Approval decision guard ------------------------------------------------------------------
create or replace function private.approval_decision_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_v record; v_step record; v_route record; v_scope record; v_me uuid := private.my_membership(new.company_id);
begin
  select * into v_v from public.document_versions where company_id = new.company_id and id = new.version_id;
  select * into v_scope from private.document_scope(new.company_id, new.version_id);
  if not private.is_human_actor(new.company_id) or v_me is distinct from new.decided_by_membership_id then
    raise exception 'PPI_HUMAN_ONLY: approval decisions must be recorded by the deciding human themself' using errcode = 'P0001';
  end if;
  if v_v.status <> 'in_review' then
    raise exception 'PPI_LIFECYCLE: decisions are only accepted while the version is in review' using errcode = 'P0001';
  end if;
  select * into v_route from public.approval_routes where company_id = new.company_id and id = v_v.route_id;
  select * into v_step from public.approval_route_steps where company_id = new.company_id and route_id = v_v.route_id and step_no = new.step_no;
  if v_step.step_no is null then raise exception 'PPI_ROUTE: step % is not in this route', new.step_no using errcode = 'P0001'; end if;
  if exists (select 1 from public.approval_route_steps s where s.company_id = new.company_id and s.route_id = v_v.route_id
               and s.step_no < new.step_no and private.step_approvals(new.company_id, new.version_id, s.step_no) < s.required_approvals) then
    raise exception 'PPI_ROUTE: earlier route steps are not complete' using errcode = 'P0001';
  end if;
  if not private.has_permission(new.company_id, v_step.required_permission, v_scope.department_id, v_scope.process_id) then
    raise exception 'PPI_AUTHORITY: % required in scope for step %', v_step.required_permission, new.step_no using errcode = 'P0001';
  end if;
  if v_route.segregate_author and v_me = v_v.author_membership_id then
    raise exception 'PPI_SOD: the author cannot approve their own document' using errcode = 'P0001';
  end if;
  if v_route.distinct_approvers and new.decision = 'approved' and exists (
       select 1 from public.approval_decisions a where a.company_id = new.company_id and a.version_id = new.version_id
          and a.decided_by_membership_id = v_me and a.decision = 'approved' and a.content_sha256 = v_v.content_sha256
          and a.step_no <> new.step_no) then
    raise exception 'PPI_SOD: one person cannot satisfy two approval steps' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.approval_decisions a where a.company_id = new.company_id and a.version_id = new.version_id
               and a.step_no = new.step_no and a.decided_by_membership_id = v_me and a.content_sha256 = v_v.content_sha256) then
    raise exception 'PPI_DUPLICATE: you already decided this step for this content' using errcode = 'P0001';
  end if;
  new.content_sha256 := v_v.content_sha256;
  new.decided_at := now();
  return new;
end $$;
create or replace function private.approval_decision_after() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.decision = 'rejected' then
    update public.document_versions set status = 'rejected' where company_id = new.company_id and id = new.version_id;
  elsif new.decision = 'changes_requested' then
    update public.document_versions set status = 'draft' where company_id = new.company_id and id = new.version_id;
  elsif private.route_complete(new.company_id, new.version_id) then
    update public.document_versions set status = 'approved' where company_id = new.company_id and id = new.version_id;
  end if;
  return null;
end $$;
create trigger approval_decisions_guard before insert on public.approval_decisions for each row execute function private.approval_decision_guard();
create trigger approval_decisions_after after insert on public.approval_decisions for each row execute function private.approval_decision_after();

create or replace function private.acknowledgement_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.document_versions where company_id = new.company_id and id = new.version_id and status = 'published') then
    raise exception 'PPI_LIFECYCLE: only the published version can be acknowledged' using errcode = 'P0001';
  end if;
  if (select auth.uid()) is not null and new.membership_id is distinct from private.my_membership(new.company_id) then
    raise exception 'PPI_HUMAN_ONLY: members acknowledge for themselves only' using errcode = 'P0001';
  end if;
  new.acknowledged_at := now();
  return new;
end $$;
create trigger document_acknowledgements_guard before insert on public.document_acknowledgements for each row execute function private.acknowledgement_guard();

create trigger audit_document_versions after insert or update on public.document_versions for each row execute function private.audit_row();
create trigger audit_approval_decisions after insert on public.approval_decisions for each row execute function private.audit_row();
create trigger audit_document_acknowledgements after insert on public.document_acknowledgements for each row execute function private.audit_row();
create trigger audit_approval_routes after insert or update on public.approval_routes for each row execute function private.audit_row();

-- Read helpers ------------------------------------------------------------------------------
create or replace function private.can_work_on_document(p_company uuid, p_department uuid, p_process uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.has_permission(p_company, 'document.draft', p_department, p_process)
      or private.has_permission(p_company, 'document.review_owner', p_department, p_process)
      or private.has_permission(p_company, 'document.review_functional', p_department, p_process)
      or private.has_permission(p_company, 'document.review_risk', p_department, p_process)
      or private.has_permission(p_company, 'document.review_legal', p_department, p_process)
      or private.has_permission(p_company, 'document.approve', p_department, p_process)
      or private.has_permission(p_company, 'document.publish', p_department, p_process)
$$;
create or replace function private.can_read_document_version(p_company uuid, p_version uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.document_versions v join public.documents d on d.company_id = v.company_id and d.id = v.document_id
     where v.company_id = p_company and v.id = p_version
       and ( (v.status in ('published','superseded')
              and private.can_read(p_company, 'document.read', d.department_id, d.process_id, d.classification))
          or private.can_work_on_document(p_company, d.department_id, d.process_id)
          or v.author_membership_id = private.my_membership(p_company)))
$$;
grant execute on all functions in schema private to authenticated, service_role;

alter table public.document_types            enable row level security;
alter table public.approval_routes           enable row level security;
alter table public.approval_route_steps      enable row level security;
alter table public.documents                 enable row level security;
alter table public.document_versions         enable row level security;
alter table public.document_version_sources  enable row level security;
alter table public.approval_decisions        enable row level security;
alter table public.document_distributions    enable row level security;
alter table public.document_acknowledgements enable row level security;
alter table public.document_change_requests  enable row level security;

create policy dt_read on public.document_types for select to authenticated using ((select private.is_active_member(company_id)));
create policy dt_write on public.document_types for insert to authenticated with check ((select private.has_permission(company_id, 'org.manage')));
create policy ar_read on public.approval_routes for select to authenticated using ((select private.is_active_member(company_id)));
create policy ar_write on public.approval_routes for insert to authenticated with check ((select private.has_permission(company_id, 'org.manage')));
create policy ar_update on public.approval_routes for update to authenticated
  using ((select private.has_permission(company_id, 'org.manage'))) with check ((select private.has_permission(company_id, 'org.manage')));
create policy ars_read on public.approval_route_steps for select to authenticated using ((select private.is_active_member(company_id)));
create policy ars_write on public.approval_route_steps for insert to authenticated with check ((select private.has_permission(company_id, 'org.manage')));

create policy doc_read on public.documents for select to authenticated
  using ((select private.can_read(company_id, 'document.read', department_id, process_id, classification))
      or (select private.can_work_on_document(company_id, department_id, process_id)));
create policy doc_insert on public.documents for insert to authenticated
  with check ((select private.has_permission(company_id, 'document.draft', department_id, process_id)));
create policy doc_update on public.documents for update to authenticated
  using ((select private.has_permission(company_id, 'document.draft', department_id, process_id)))
  with check ((select private.has_permission(company_id, 'document.draft', department_id, process_id)));

create policy dv_read on public.document_versions for select to authenticated using ((select private.can_read_document_version(company_id, id)));
create policy dv_insert on public.document_versions for insert to authenticated
  with check ((select private.has_permission(company_id, 'document.draft',
                 (select d.department_id from public.documents d where d.company_id = document_versions.company_id and d.id = document_versions.document_id),
                 (select d.process_id from public.documents d where d.company_id = document_versions.company_id and d.id = document_versions.document_id))));
create policy dv_update on public.document_versions for update to authenticated
  using ((select private.can_read_document_version(company_id, id))) with check ((select private.can_read_document_version(company_id, id)));
  -- who may change what is enforced by private.document_version_guard

create policy dvs_read on public.document_version_sources for select to authenticated using ((select private.can_read_document_version(company_id, version_id)));
create policy dvs_insert on public.document_version_sources for insert to authenticated
  with check ((select private.can_read_document_version(company_id, version_id))
              and (knowledge_record_id is null or (select private.can_read_knowledge(company_id, knowledge_record_id)))
              and (evidence_file_id is null or (select private.can_read_evidence(company_id, evidence_file_id)))
              and (process_version_id is null or (select private.can_read_process(company_id, private.version_process(company_id, process_version_id)))));

create policy ad_read on public.approval_decisions for select to authenticated using ((select private.can_read_document_version(company_id, version_id)));
create policy ad_insert on public.approval_decisions for insert to authenticated with check ((select private.can_read_document_version(company_id, version_id)));

create policy dist_read on public.document_distributions for select to authenticated
  using (membership_id = (select private.my_membership(company_id))
      or (select private.has_permission(company_id, 'document.publish',
            (private.document_scope(company_id, version_id)).department_id, (private.document_scope(company_id, version_id)).process_id)));
create policy dist_insert on public.document_distributions for insert to authenticated
  with check ((select private.has_permission(company_id, 'document.publish',
            (private.document_scope(company_id, version_id)).department_id, (private.document_scope(company_id, version_id)).process_id)));

create policy ack_read on public.document_acknowledgements for select to authenticated
  using (membership_id = (select private.my_membership(company_id))
      or (select private.has_permission(company_id, 'document.publish',
            (private.document_scope(company_id, version_id)).department_id, (private.document_scope(company_id, version_id)).process_id)));
create policy ack_insert on public.document_acknowledgements for insert to authenticated
  with check (membership_id = (select private.my_membership(company_id)) and (select private.can_read_document_version(company_id, version_id)));

create policy dcr_read on public.document_change_requests for select to authenticated
  using (requested_by_membership_id = (select private.my_membership(company_id))
      or (select private.has_permission(company_id, 'document.draft',
            (select d.department_id from public.documents d where d.company_id = document_change_requests.company_id and d.id = document_change_requests.document_id))));
create policy dcr_insert on public.document_change_requests for insert to authenticated
  with check (requested_by_membership_id = (select private.my_membership(company_id)) and (select private.is_active_member(company_id)));
