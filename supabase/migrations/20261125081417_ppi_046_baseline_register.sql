-- PPI-046: Baseline library + company register (SOW 12G Q3, D-108).
-- * The platform keeps versioned baselines (e.g. the India Private Limited audit-readiness master v4.2): every sheet row is kept
--   as-is (data jsonb) so nothing is lost, with a code / title / department pulled out for lookups.
-- * Links (document dependencies, law-to-document mapping) are derived at the end of an import.
-- * A company adopts a baseline: its register gets one row per expected document, end-to-end process and applicability
--   question, all "not assessed". "No document missing" = every register row ends as found / partial / outdated / missing /
--   not applicable (with a reason). Company documents that match nothing become "extra" rows.
-- The baseline itself is generic reference material (no company data): readable by every signed-in user.

create table public.baseline_versions (
  id            uuid not null default gen_random_uuid() primary key,
  code          text not null check (code ~ '^[A-Z0-9][A-Z0-9-]{1,39}$'),
  version       text not null check (length(trim(version)) between 1 and 20),
  title         text not null check (length(trim(title)) between 3 and 200),
  as_of         date,
  source_name   text,
  source_sha256 text check (source_sha256 ~ '^[0-9a-f]{64}$'),
  status        text not null default 'importing' check (status in ('importing', 'active', 'retired')),
  sheet_meta    jsonb not null default '{}'::jsonb,     -- sheet -> {columns:[...], rows:n, header_row:n}
  counts        jsonb not null default '{}'::jsonb,     -- reconciliation after import
  imported_by   uuid references auth.users(id),
  imported_at   timestamptz not null default now(),
  activated_at  timestamptz,
  unique (code, version)
);

create table public.baseline_items (
  id          bigint generated always as identity primary key,
  version_id  uuid not null references public.baseline_versions(id) on delete cascade,
  sheet       text not null,
  row_no      int not null check (row_no > 0),
  code        text,
  title       text,
  department  text,
  data        jsonb not null,
  unique (version_id, sheet, row_no)
);
create index baseline_items_code on public.baseline_items (version_id, sheet, code);
create index baseline_items_version on public.baseline_items (version_id);
create index baseline_versions_imported_by on public.baseline_versions (imported_by);

create table public.baseline_links (
  id          bigint generated always as identity primary key,
  version_id  uuid not null references public.baseline_versions(id) on delete cascade,
  relation    text not null check (relation in ('document_dependency', 'legal_mapping')),
  from_code   text not null,
  to_code     text not null,
  data        jsonb not null default '{}'::jsonb
);
create index baseline_links_from on public.baseline_links (version_id, relation, from_code);
create index baseline_links_to on public.baseline_links (version_id, relation, to_code);

alter table public.baseline_versions enable row level security;
alter table public.baseline_items enable row level security;
alter table public.baseline_links enable row level security;
create policy baseline_versions_read on public.baseline_versions for select to authenticated
  using (status = 'active' or (select private.is_platform_admin()));
create policy baseline_items_read on public.baseline_items for select to authenticated
  using (exists (select 1 from public.baseline_versions v where v.id = version_id and (v.status = 'active' or (select private.is_platform_admin()))));
create policy baseline_links_read on public.baseline_links for select to authenticated
  using (exists (select 1 from public.baseline_versions v where v.id = version_id and (v.status = 'active' or (select private.is_platform_admin()))));
revoke all on public.baseline_versions, public.baseline_items, public.baseline_links from anon, authenticated;
grant select on public.baseline_versions, public.baseline_items, public.baseline_links to authenticated;

-- ---------- import (platform owner; the browser parses the workbook and sends rows in chunks) ----------
create or replace function public.baseline_begin(p_code text, p_version text, p_title text, p_as_of date, p_source_name text,
  p_source_sha256 text, p_sheet_meta jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_status text;
begin
  if not private.is_platform_admin() then raise exception 'PPI_FORBIDDEN: platform owner only' using errcode = '42501'; end if;
  select id, status into v_id, v_status from public.baseline_versions where code = upper(trim(p_code)) and version = trim(p_version);
  if v_status in ('active', 'retired') then
    raise exception 'PPI_BASELINE: % version % is already imported; use a new version number', upper(trim(p_code)), trim(p_version) using errcode = 'P0001';
  end if;
  if v_id is not null then   -- an interrupted import: start again cleanly
    delete from public.baseline_items where version_id = v_id;
    delete from public.baseline_links where version_id = v_id;
    update public.baseline_versions set title = trim(p_title), as_of = p_as_of, source_name = p_source_name, source_sha256 = p_source_sha256,
      sheet_meta = coalesce(p_sheet_meta, '{}'::jsonb), imported_by = auth.uid(), imported_at = now() where id = v_id;
  else
    insert into public.baseline_versions (code, version, title, as_of, source_name, source_sha256, sheet_meta, imported_by)
    values (upper(trim(p_code)), trim(p_version), trim(p_title), p_as_of, p_source_name, p_source_sha256, coalesce(p_sheet_meta, '{}'::jsonb), auth.uid())
    returning id into v_id;
  end if;
  return v_id;
end $$;

create or replace function public.baseline_add_rows(p_version uuid, p_sheet text, p_rows jsonb) returns int
language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  if not private.is_platform_admin() then raise exception 'PPI_FORBIDDEN: platform owner only' using errcode = '42501'; end if;
  if not exists (select 1 from public.baseline_versions where id = p_version and status = 'importing') then
    raise exception 'PPI_BASELINE: this import is not open' using errcode = 'P0001';
  end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 500 then
    raise exception 'PPI_BASELINE: send at most 500 rows at a time' using errcode = 'P0001';
  end if;
  insert into public.baseline_items (version_id, sheet, row_no, code, title, department, data)
  select p_version, p_sheet, (r->>'row_no')::int, nullif(trim(r->>'code'), ''), left(nullif(trim(r->>'title'), ''), 500),
         left(nullif(trim(r->>'department'), ''), 200), r->'data'
    from jsonb_array_elements(p_rows) r
  on conflict (version_id, sheet, row_no) do update set code = excluded.code, title = excluded.title, department = excluded.department, data = excluded.data;
  get diagnostics n = row_count;
  return n;
end $$;

/** Derives links, reconciles row counts against the sheet metadata, activates. Returns {sheet: {expected, imported}}. */
create or replace function public.baseline_finish(p_version uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_meta jsonb; v_counts jsonb; v_bad int;
begin
  if not private.is_platform_admin() then raise exception 'PPI_FORBIDDEN: platform owner only' using errcode = '42501'; end if;
  select sheet_meta into v_meta from public.baseline_versions where id = p_version and status = 'importing';
  if v_meta is null then raise exception 'PPI_BASELINE: this import is not open' using errcode = 'P0001'; end if;

  delete from public.baseline_links where version_id = p_version;
  insert into public.baseline_links (version_id, relation, from_code, to_code, data)
  select p_version, 'document_dependency', trim(data->>'Prerequisite ID'), trim(data->>'Dependent ID'),
         jsonb_build_object('type', data->>'Dependency Type', 'handoff', data->>'Required Handoff / Relationship', 'failure', data->>'Failure Mode if Broken')
    from public.baseline_items where version_id = p_version and sheet = 'Document Dependencies'
     and coalesce(trim(data->>'Prerequisite ID'), '') <> '' and coalesce(trim(data->>'Dependent ID'), '') <> '';
  insert into public.baseline_links (version_id, relation, from_code, to_code, data)
  select p_version, 'legal_mapping', trim(data->>'Legal ID'), trim(data->>'Linked Object ID'),
         jsonb_build_object('object_type', data->>'Linked Object Type', 'control', data->>'Required Control / Process Impact')
    from public.baseline_items where version_id = p_version and sheet = 'Legal Control Mapping'
     and coalesce(trim(data->>'Legal ID'), '') <> '' and coalesce(trim(data->>'Linked Object ID'), '') <> '';

  select jsonb_object_agg(s.key, jsonb_build_object('expected', (s.value->>'rows')::int,
           'imported', (select count(*) from public.baseline_items i where i.version_id = p_version and i.sheet = s.key)))
    into v_counts from jsonb_each(v_meta) s;
  select count(*) into v_bad from jsonb_each(coalesce(v_counts, '{}'::jsonb)) c where (c.value->>'expected')::int <> (c.value->>'imported')::int;
  if v_bad > 0 then
    update public.baseline_versions set counts = v_counts where id = p_version;
    raise exception 'PPI_BASELINE: % sheet(s) did not import completely: %', v_bad, v_counts using errcode = 'P0001';
  end if;
  v_counts := v_counts || jsonb_build_object('_links', (select jsonb_object_agg(relation, n) from
    (select relation, count(*) n from public.baseline_links where version_id = p_version group by relation) x));
  update public.baseline_versions set status = 'active', activated_at = now(), counts = v_counts where id = p_version;
  insert into private.platform_events (actor, action, detail) values (auth.uid(), 'baseline.activated', jsonb_build_object('version', p_version));
  return v_counts;
end $$;

revoke all on function public.baseline_begin(text, text, text, date, text, text, jsonb), public.baseline_add_rows(uuid, text, jsonb),
  public.baseline_finish(uuid) from public, anon;
grant execute on function public.baseline_begin(text, text, text, date, text, text, jsonb), public.baseline_add_rows(uuid, text, jsonb),
  public.baseline_finish(uuid) to authenticated;

-- ---------- company register ----------
create table public.company_baselines (
  company_id   uuid not null references public.companies(id),
  version_id   uuid not null references public.baseline_versions(id),
  adopted_at   timestamptz not null default now(),
  adopted_by   uuid references auth.users(id),
  primary key (company_id, version_id)
);
create index company_baselines_version on public.company_baselines (version_id);
create index company_baselines_adopted_by on public.company_baselines (adopted_by);

create table public.register_items (
  id                   uuid not null default gen_random_uuid() primary key,
  company_id           uuid not null references public.companies(id),
  version_id           uuid references public.baseline_versions(id),
  kind                 text not null check (kind in ('document', 'process', 'applicability')),
  code                 text not null,
  title                text not null,
  department_label     text,
  department_id        uuid,
  criticality          text,
  status               text not null default 'not_assessed'
                       check (status in ('not_assessed', 'found', 'partial', 'outdated', 'missing', 'not_applicable', 'extra')),
  not_applicable_reason text,
  owner_membership_id  uuid,
  evidence_count       int not null default 0,
  note                 text,
  updated_at           timestamptz not null default now(),
  updated_by           uuid,
  unique (company_id, id),
  unique (company_id, kind, code),
  check (status <> 'not_applicable' or length(trim(coalesce(not_applicable_reason, ''))) >= 5),
  foreign key (company_id, department_id) references public.departments(company_id, id),
  foreign key (company_id, owner_membership_id) references public.memberships(company_id, id)
);
create index register_items_version on public.register_items (version_id);
create index register_items_dept on public.register_items (company_id, department_id);
create index register_items_owner on public.register_items (company_id, owner_membership_id);
create trigger audit_register_items after insert or update on public.register_items for each row execute function private.audit_row();

alter table public.company_baselines enable row level security;
alter table public.register_items enable row level security;
create policy company_baselines_read on public.company_baselines for select to authenticated
  using ((select private.is_active_member(company_id)) or (select private.is_platform_admin()));
create policy register_items_read on public.register_items for select to authenticated
  using ((select private.has_permission(company_id, 'org.manage')) or (select private.has_permission(company_id, 'audit.read'))
         or (select private.has_permission(company_id, 'dashboard.read')));
revoke all on public.company_baselines, public.register_items from anon, authenticated;
grant select on public.company_baselines, public.register_items to authenticated;

/** Company admin adopts a baseline: one register row per expected document, process and applicability question. Idempotent. */
create or replace function public.adopt_baseline(p_company uuid, p_version uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare n_doc int; n_proc int; n_app int;
begin
  if not (private.has_permission(p_company, 'org.manage') or private.is_platform_admin()) then
    raise exception 'PPI_FORBIDDEN: company administrators only' using errcode = '42501';
  end if;
  if not exists (select 1 from public.baseline_versions where id = p_version and status = 'active') then
    raise exception 'PPI_BASELINE: baseline not available' using errcode = 'P0001';
  end if;
  insert into public.company_baselines (company_id, version_id, adopted_by) values (p_company, p_version, auth.uid()) on conflict do nothing;

  insert into public.register_items (company_id, version_id, kind, code, title, department_label, criticality)
  select p_company, p_version, 'document', i.code, coalesce(i.title, i.code), i.department, i.data->>'Audit Criticality'
    from public.baseline_items i where i.version_id = p_version and i.sheet = 'Department Register' and i.code is not null
  on conflict (company_id, kind, code) do nothing;
  get diagnostics n_doc = row_count;
  insert into public.register_items (company_id, version_id, kind, code, title, department_label)
  select p_company, p_version, 'process', i.code, coalesce(i.title, i.code), i.data->>'Accountable (A)'
    from public.baseline_items i where i.version_id = p_version and i.sheet = 'Process RACI Detail' and i.code is not null
  on conflict (company_id, kind, code) do nothing;
  get diagnostics n_proc = row_count;
  insert into public.register_items (company_id, version_id, kind, code, title, department_label)
  select p_company, p_version, 'applicability', i.code, coalesce(i.title, i.code), i.data->>'Role to Confirm'
    from public.baseline_items i where i.version_id = p_version and i.sheet = 'Legal Applicability Decisions' and i.code is not null
  on conflict (company_id, kind, code) do nothing;
  get diagnostics n_app = row_count;
  return jsonb_build_object('documents', n_doc, 'processes', n_proc, 'applicability', n_app);
end $$;

/** Admin sets a register row's status (not applicable needs a reason) and, optionally, its owner. */
create or replace function public.register_set_status(p_company uuid, p_item uuid, p_status text, p_reason text default null,
  p_owner uuid default null, p_note text default null) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not private.has_permission(p_company, 'org.manage') then
    raise exception 'PPI_FORBIDDEN: company administrators only' using errcode = '42501';
  end if;
  update public.register_items set status = p_status, not_applicable_reason = case when p_status = 'not_applicable' then p_reason else null end,
    owner_membership_id = coalesce(p_owner, owner_membership_id), note = coalesce(p_note, note), updated_at = now(), updated_by = auth.uid()
   where company_id = p_company and id = p_item;
  if not found then raise exception 'PPI_NOT_FOUND: register item' using errcode = 'P0002'; end if;
end $$;

revoke all on function public.adopt_baseline(uuid, uuid), public.register_set_status(uuid, uuid, text, text, uuid, text) from public, anon;
grant execute on function public.adopt_baseline(uuid, uuid), public.register_set_status(uuid, uuid, text, text, uuid, text) to authenticated;
