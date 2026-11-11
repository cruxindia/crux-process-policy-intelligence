-- PPI-006 Evidence (FR-09) and shared knowledge with provenance (FR-09).
-- claim_origin (where a claim came from) is separate from lifecycle_status (where it is in review) — C-04 / D-012.

create table public.evidence_files (
  id               uuid not null default gen_random_uuid() primary key,
  company_id       uuid not null,
  department_id    uuid not null,
  process_id       uuid,
  title            text not null,
  storage_bucket   text not null default 'evidence-private',
  storage_path     text not null,
  sha256           text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  mime_type        text not null,
  size_bytes       bigint not null check (size_bytes >= 0),
  classification   text not null default 'internal' check (classification in ('public','internal','confidential','restricted')),
  source_date      date,
  source_version   text,
  uploaded_by_membership_id uuid not null,
  review_status    text not null default 'unreviewed'
                   check (review_status in ('unreviewed','relevant','questioned','rejected')),
  review_note      text,
  created_at       timestamptz not null default now(),
  unique (company_id, id),
  unique (company_id, storage_bucket, storage_path),
  foreign key (company_id) references public.companies(id),
  foreign key (company_id, department_id) references public.departments(company_id, id),
  foreign key (company_id, process_id) references public.processes(company_id, id),
  foreign key (company_id, uploaded_by_membership_id) references public.memberships(company_id, id)
);
create index evidence_files_dept_idx on public.evidence_files (company_id, department_id);

create or replace function private.evidence_guard() returns trigger
language plpgsql set search_path = '' as $$
begin
  if (new.sha256, new.storage_bucket, new.storage_path, new.size_bytes, new.mime_type, new.uploaded_by_membership_id, new.company_id)
     is distinct from (old.sha256, old.storage_bucket, old.storage_path, old.size_bytes, old.mime_type, old.uploaded_by_membership_id, old.company_id) then
    raise exception 'PPI_IMMUTABLE: evidence file identity fields cannot change; upload a new file' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger evidence_files_guard before update on public.evidence_files for each row execute function private.evidence_guard();
create trigger evidence_files_no_delete before delete on public.evidence_files for each row execute function private.forbid_mutation();

create table public.knowledge_records (
  id                   uuid not null default gen_random_uuid() primary key,
  company_id           uuid not null references public.companies(id),
  record_code          text not null default ('KR-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,10))),
  record_type          text not null check (record_type in ('fact','responsibility','process_step','decision_rule','system','record',
                                                             'metric','sla','exception','pain_point','risk','control','policy_rule',
                                                             'dependency','improvement_idea','definition')),
  title                text not null,
  claim_text           text not null check (length(trim(claim_text)) > 0),
  department_id        uuid not null,
  process_id           uuid,
  classification       text not null default 'internal' check (classification in ('public','internal','confidential','restricted')),
  claim_origin         text not null check (claim_origin in ('employee_statement','document_extract','system_extract','ai_extraction',
                                                              'ai_inference','unverified_hypothesis','external_reference','management_decision')),
  state_kind           text not null default 'as_is' check (state_kind in ('as_is','to_be','policy','not_applicable')),
  lifecycle_status     text not null default 'draft'
                       check (lifecycle_status in ('draft','submitted','under_review','verified','approved','disputed','rejected','superseded','retired')),
  confidence           numeric(3,2) check (confidence between 0 and 1),
  confidence_rationale text,
  supersedes_record_id uuid,
  ai_run_id            uuid,              -- FK added in PPI-010
  created_by_membership_id  uuid,
  verified_by_membership_id uuid,
  verified_at          timestamptz,
  approved_by_membership_id uuid,
  approved_at          timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique (company_id, id),
  unique (company_id, record_code),
  foreign key (company_id, department_id) references public.departments(company_id, id),
  foreign key (company_id, process_id) references public.processes(company_id, id),
  foreign key (company_id, supersedes_record_id) references public.knowledge_records(company_id, id),
  foreign key (company_id, created_by_membership_id) references public.memberships(company_id, id),
  foreign key (company_id, verified_by_membership_id) references public.memberships(company_id, id),
  foreign key (company_id, approved_by_membership_id) references public.memberships(company_id, id),
  -- AI output can only enter as AI-labelled claims (AC-03)
  check (ai_run_id is null or claim_origin in ('ai_extraction','ai_inference','unverified_hypothesis')),
  check (confidence is null or coalesce(length(trim(confidence_rationale)),0) > 0)
);
create index knowledge_records_scope_idx on public.knowledge_records (company_id, department_id, process_id);
create index knowledge_records_status_idx on public.knowledge_records (company_id, lifecycle_status);
create index knowledge_records_fts_idx on public.knowledge_records
  using gin (to_tsvector('simple', coalesce(title,'') || ' ' || coalesce(claim_text,'')));

create table public.knowledge_sources (
  id                  uuid not null default gen_random_uuid() primary key,
  company_id          uuid not null,
  knowledge_record_id uuid not null,
  source_type         text not null check (source_type in ('interview_answer','evidence_file','knowledge_record','external_reference')),
  interview_answer_id uuid,
  evidence_file_id    uuid,
  source_record_id    uuid,
  external_reference  text,
  locator             text,              -- page/section/line/timestamp within the source
  relation            text not null default 'supports' check (relation in ('supports','challenges','context')),
  linked_by_membership_id uuid,
  created_at          timestamptz not null default now(),
  unique (company_id, id),
  foreign key (company_id, knowledge_record_id) references public.knowledge_records(company_id, id),
  foreign key (company_id, interview_answer_id) references public.interview_answers(company_id, id),
  foreign key (company_id, evidence_file_id) references public.evidence_files(company_id, id),
  foreign key (company_id, source_record_id) references public.knowledge_records(company_id, id),
  check (num_nonnulls(interview_answer_id, evidence_file_id, source_record_id, external_reference) = 1),
  check ((source_type = 'interview_answer'   and interview_answer_id is not null)
      or (source_type = 'evidence_file'      and evidence_file_id is not null)
      or (source_type = 'knowledge_record'   and source_record_id is not null)
      or (source_type = 'external_reference' and external_reference is not null)),
  check (source_record_id is distinct from knowledge_record_id)
);
create index knowledge_sources_record_idx on public.knowledge_sources (company_id, knowledge_record_id);
create index knowledge_sources_answer_idx on public.knowledge_sources (company_id, interview_answer_id);
create index knowledge_sources_evidence_idx on public.knowledge_sources (company_id, evidence_file_id);

create table public.knowledge_relationships (
  company_id     uuid not null,
  from_record_id uuid not null,
  to_record_id   uuid not null,
  relation       text not null check (relation in ('depends_on','contradicts','duplicates','refines','related_to')),
  noted_by_membership_id uuid,
  created_at     timestamptz not null default now(),
  primary key (company_id, from_record_id, to_record_id, relation),
  foreign key (company_id, from_record_id) references public.knowledge_records(company_id, id),
  foreign key (company_id, to_record_id) references public.knowledge_records(company_id, id),
  check (from_record_id <> to_record_id)
);

create table public.knowledge_reviews (
  id                  uuid not null default gen_random_uuid() primary key,
  company_id          uuid not null,
  knowledge_record_id uuid not null,
  reviewer_membership_id uuid not null,
  action              text not null check (action in ('comment','request_change','confirm','challenge')),
  comment             text not null,
  created_at          timestamptz not null default now(),
  foreign key (company_id, knowledge_record_id) references public.knowledge_records(company_id, id),
  foreign key (company_id, reviewer_membership_id) references public.memberships(company_id, id)
);
create trigger knowledge_reviews_append_only before update or delete on public.knowledge_reviews
  for each row execute function private.forbid_mutation();

-- Knowledge lifecycle guard ----------------------------------------------------
create or replace function private.knowledge_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_supports int;
begin
  if tg_op = 'INSERT' then
    if new.lifecycle_status not in ('draft','submitted') then
      raise exception 'PPI_LIFECYCLE: knowledge records start as draft or submitted' using errcode = 'P0001';
    end if;
    if (select auth.uid()) is not null then new.created_by_membership_id := private.my_membership(new.company_id); end if;
    new.verified_by_membership_id := null; new.verified_at := null;
    new.approved_by_membership_id := null; new.approved_at := null;
    return new;
  end if;

  if (new.company_id, new.claim_text, new.claim_origin, new.record_type, new.ai_run_id, new.created_by_membership_id,
      new.supersedes_record_id, new.created_at, new.state_kind)
     is distinct from
     (old.company_id, old.claim_text, old.claim_origin, old.record_type, old.ai_run_id, old.created_by_membership_id,
      old.supersedes_record_id, old.created_at, old.state_kind) then
    raise exception 'PPI_IMMUTABLE: claim content/origin cannot be edited; create a superseding record' using errcode = 'P0001';
  end if;
  if old.lifecycle_status <> 'draft' and (new.title, new.department_id, new.process_id, new.confidence)
                                     is distinct from (old.title, old.department_id, old.process_id, old.confidence) then
    raise exception 'PPI_IMMUTABLE: only draft records can be re-scoped or re-titled' using errcode = 'P0001';
  end if;

  perform private.assert_transition('knowledge_record', old.lifecycle_status, new.lifecycle_status, array[
    'draft>submitted','draft>retired','submitted>under_review','submitted>rejected',
    'under_review>verified','under_review>rejected','under_review>draft',
    'verified>approved','submitted>disputed','under_review>disputed','verified>disputed','approved>disputed',
    'disputed>under_review','disputed>rejected',
    'verified>superseded','approved>superseded','verified>retired','approved>retired']);

  select count(*) into v_supports from public.knowledge_sources s
   where s.company_id = new.company_id and s.knowledge_record_id = new.id and s.relation = 'supports';

  if new.lifecycle_status = 'submitted' and old.lifecycle_status = 'draft'
     and new.claim_origin = 'ai_extraction' and v_supports = 0 then
    raise exception 'PPI_PROVENANCE: an AI extraction needs at least one supporting source before submission' using errcode = 'P0001';
  end if;

  if new.lifecycle_status = 'verified' and old.lifecycle_status <> 'verified' then
    if new.claim_origin in ('ai_inference','unverified_hypothesis') then
      raise exception 'PPI_PROVENANCE: inference/hypothesis cannot be verified; a human must record a sourced claim' using errcode = 'P0001';
    end if;
    if v_supports = 0 and new.claim_origin <> 'management_decision' then
      raise exception 'PPI_PROVENANCE: verification needs at least one supporting source' using errcode = 'P0001';
    end if;
    if not private.is_human_actor(new.company_id)
       or not private.has_permission(new.company_id, 'knowledge.verify', new.department_id, new.process_id) then
      raise exception 'PPI_HUMAN_ONLY: verification requires a human with knowledge.verify in scope' using errcode = 'P0001';
    end if;
    new.verified_by_membership_id := private.my_membership(new.company_id);
    new.verified_at := now();
  end if;

  if new.lifecycle_status = 'approved' and old.lifecycle_status <> 'approved' then
    if not private.is_human_actor(new.company_id)
       or not private.has_permission(new.company_id, 'knowledge.approve', new.department_id, new.process_id) then
      raise exception 'PPI_HUMAN_ONLY: approval requires a human with knowledge.approve in scope' using errcode = 'P0001';
    end if;
    new.approved_by_membership_id := private.my_membership(new.company_id);
    new.approved_at := now();
  end if;

  if new.lifecycle_status = 'superseded' and old.lifecycle_status <> 'superseded'
     and not exists (select 1 from public.knowledge_records r where r.company_id = new.company_id and r.supersedes_record_id = new.id) then
    raise exception 'PPI_LIFECYCLE: superseded requires a successor record that references it' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger knowledge_records_guard before insert or update on public.knowledge_records
  for each row execute function private.knowledge_guard();
create trigger knowledge_records_updated before update on public.knowledge_records for each row execute function private.set_updated_at();
create trigger knowledge_records_no_delete before delete on public.knowledge_records for each row execute function private.forbid_mutation();

-- Source links: append-only once the record has left draft.
create or replace function private.knowledge_source_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_status text;
begin
  select lifecycle_status into v_status from public.knowledge_records
   where company_id = coalesce(new.company_id, old.company_id) and id = coalesce(new.knowledge_record_id, old.knowledge_record_id);
  if tg_op in ('UPDATE','DELETE') and v_status <> 'draft' then
    raise exception 'PPI_APPEND_ONLY: source links of a non-draft record cannot be changed' using errcode = 'P0001';
  end if;
  if tg_op = 'INSERT' then
    if v_status in ('approved','superseded','retired','rejected') then
      raise exception 'PPI_LIFECYCLE: cannot add sources to a % record', v_status using errcode = 'P0001';
    end if;
    if (select auth.uid()) is not null then new.linked_by_membership_id := private.my_membership(new.company_id); end if;
  end if;
  return coalesce(new, old);
end $$;
create trigger knowledge_sources_guard before insert or update or delete on public.knowledge_sources
  for each row execute function private.knowledge_source_guard();

create trigger audit_knowledge_records after insert or update on public.knowledge_records for each row execute function private.audit_row();
create trigger audit_knowledge_sources after insert or delete on public.knowledge_sources for each row execute function private.audit_row();
create trigger audit_evidence_files after insert or update on public.evidence_files for each row execute function private.audit_row();

-- Read helpers -------------------------------------------------------------------
create or replace function private.can_read_evidence(p_company uuid, p_evidence uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.evidence_files e where e.company_id = p_company and e.id = p_evidence
     and (e.uploaded_by_membership_id = private.my_membership(p_company)
          or private.can_read(p_company, 'evidence.read', e.department_id, e.process_id, e.classification)))
$$;
create or replace function private.can_read_knowledge(p_company uuid, p_record uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.knowledge_records k where k.company_id = p_company and k.id = p_record
     and private.can_read(p_company, 'knowledge.read', k.department_id, k.process_id, k.classification))
$$;
create or replace function private.can_read_answer(p_company uuid, p_answer uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.interview_answers a join public.interview_questions q
                   on q.company_id = a.company_id and q.id = a.question_id
                  where a.company_id = p_company and a.id = p_answer and private.can_read_session(p_company, q.session_id))
$$;
-- A source may only be cited by someone who can actually read it (AC-02: IDs must exist AND be accessible).
create or replace function private.can_cite(p_company uuid, p_answer uuid, p_evidence uuid, p_record uuid, p_external text) returns boolean
language sql stable security definer set search_path = '' as $$
  select case
    when p_answer   is not null then private.can_read_answer(p_company, p_answer)
    when p_evidence is not null then private.can_read_evidence(p_company, p_evidence)
    when p_record   is not null then private.can_read_knowledge(p_company, p_record)
    else p_external is not null end
$$;
create or replace function private.record_scope(p_company uuid, p_record uuid, out department_id uuid, out process_id uuid)
language sql stable security definer set search_path = '' as $$
  select department_id, process_id from public.knowledge_records where company_id = p_company and id = p_record
$$;
grant execute on all functions in schema private to authenticated, service_role;

alter table public.evidence_files          enable row level security;
alter table public.knowledge_records       enable row level security;
alter table public.knowledge_sources       enable row level security;
alter table public.knowledge_relationships enable row level security;
alter table public.knowledge_reviews       enable row level security;

create policy ev_read on public.evidence_files for select to authenticated using ((select private.can_read_evidence(company_id, id)));
create policy ev_insert on public.evidence_files for insert to authenticated
  with check (uploaded_by_membership_id = (select private.my_membership(company_id))
              and (select private.has_permission(company_id, 'evidence.upload', department_id, process_id)));
create policy ev_update on public.evidence_files for update to authenticated
  using ((select private.has_permission(company_id, 'evidence.review', department_id, process_id)))
  with check ((select private.has_permission(company_id, 'evidence.review', department_id, process_id)));

create policy kr_read on public.knowledge_records for select to authenticated
  using ((select private.can_read(company_id, 'knowledge.read', department_id, process_id, classification)));
create policy kr_insert on public.knowledge_records for insert to authenticated
  with check ((select private.has_permission(company_id, 'knowledge.edit', department_id, process_id)));
create policy kr_update on public.knowledge_records for update to authenticated
  using ((select private.can_read(company_id, 'knowledge.read', department_id, process_id, classification))
         and ((select private.has_permission(company_id, 'knowledge.edit', department_id, process_id))
           or (select private.has_permission(company_id, 'knowledge.verify', department_id, process_id))
           or (select private.has_permission(company_id, 'knowledge.approve', department_id, process_id))))
  with check ((select private.has_permission(company_id, 'knowledge.edit', department_id, process_id))
           or (select private.has_permission(company_id, 'knowledge.verify', department_id, process_id))
           or (select private.has_permission(company_id, 'knowledge.approve', department_id, process_id)));
  -- transition rules (who may verify/approve, provenance) enforced by private.knowledge_guard

create policy ks_read on public.knowledge_sources for select to authenticated
  using ((select private.can_read_knowledge(company_id, knowledge_record_id)));
create policy ks_insert on public.knowledge_sources for insert to authenticated
  with check ((select private.has_permission(company_id, 'knowledge.edit',
                 (private.record_scope(company_id, knowledge_record_id)).department_id,
                 (private.record_scope(company_id, knowledge_record_id)).process_id))
              and (select private.can_cite(company_id, interview_answer_id, evidence_file_id, source_record_id, external_reference)));
create policy ks_delete on public.knowledge_sources for delete to authenticated
  using ((select private.has_permission(company_id, 'knowledge.edit',
            (private.record_scope(company_id, knowledge_record_id)).department_id,
            (private.record_scope(company_id, knowledge_record_id)).process_id)));

create policy krel_read on public.knowledge_relationships for select to authenticated
  using ((select private.can_read_knowledge(company_id, from_record_id)) and (select private.can_read_knowledge(company_id, to_record_id)));
create policy krel_insert on public.knowledge_relationships for insert to authenticated
  with check ((select private.can_read_knowledge(company_id, from_record_id)) and (select private.can_read_knowledge(company_id, to_record_id))
              and (select private.has_permission(company_id, 'knowledge.edit',
                     (private.record_scope(company_id, from_record_id)).department_id,
                     (private.record_scope(company_id, from_record_id)).process_id)));

create policy krev_read on public.knowledge_reviews for select to authenticated
  using ((select private.can_read_knowledge(company_id, knowledge_record_id)));
create policy krev_insert on public.knowledge_reviews for insert to authenticated
  with check (reviewer_membership_id = (select private.my_membership(company_id))
              and (select private.can_read_knowledge(company_id, knowledge_record_id)));
