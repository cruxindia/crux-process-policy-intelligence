-- PPI-047: Bulk document intake (SOW 12G Q4/Q5, D-105, D-106).
-- Files are read on the uploader's computer. The server receives, per file: a SHA-256 fingerprint (duplicates are refused),
-- the name and folder, size, a category (governing / record / sensitive) with the reason, and — for governing documents only —
-- the extracted text. Records and sensitive records never send text. The server re-checks names: a sensitive-looking name
-- is always stored as "sensitive" and can never carry text. Only company administrators see this area (names of records
-- often contain people's names).

create table public.intake_batches (
  id          uuid not null default gen_random_uuid() primary key,
  company_id  uuid not null references public.companies(id),
  label       text not null check (length(trim(label)) between 1 and 200),
  created_by  uuid not null,
  created_at  timestamptz not null default now(),
  unique (company_id, id),
  foreign key (company_id, created_by) references public.memberships(company_id, id)
);
create index intake_batches_creator on public.intake_batches (company_id, created_by);

create table public.source_documents (
  id               uuid not null default gen_random_uuid() primary key,
  company_id       uuid not null references public.companies(id),
  batch_id         uuid,
  sha256           text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  file_name        text not null check (length(file_name) between 1 and 300),
  folder           text not null default '' check (length(folder) <= 500),
  ext              text not null default '' check (length(ext) <= 12),
  size_bytes       bigint not null default 0 check (size_bytes >= 0),
  file_modified_at timestamptz,
  category         text not null check (category in ('governing', 'record', 'sensitive')),
  doc_type         text not null default 'other' check (length(doc_type) <= 60),
  department_code  text check (department_code ~ '^[A-Z]{2,6}$'),
  reason           text check (length(reason) <= 300),
  read_status      text not null default 'not_read' check (read_status in ('read', 'not_read', 'unreadable')),
  unreadable_reason text check (length(unreadable_reason) <= 200),
  text_chars       int not null default 0,
  pages            int,
  analysis_status  text not null default 'not_needed'
                   check (analysis_status in ('not_needed', 'queued', 'running', 'done', 'failed', 'waiting_provider')),
  analysis_error   text,
  uploaded_by      uuid not null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (company_id, id),
  unique (company_id, sha256),
  foreign key (company_id, batch_id) references public.intake_batches(company_id, id),
  foreign key (company_id, uploaded_by) references public.memberships(company_id, id)
);
create index source_documents_batch on public.source_documents (company_id, batch_id);
create index source_documents_uploader on public.source_documents (company_id, uploaded_by);
create index source_documents_queue on public.source_documents (analysis_status, created_at) where analysis_status in ('queued', 'waiting_provider');
create index source_documents_cat on public.source_documents (company_id, category, department_code);

create table public.source_document_texts (
  document_id  uuid not null primary key,
  company_id   uuid not null references public.companies(id),
  body         text not null check (length(body) between 1 and 400000),
  created_at   timestamptz not null default now(),
  foreign key (company_id, document_id) references public.source_documents(company_id, id) on delete cascade
);
create index source_document_texts_company on public.source_document_texts (company_id, document_id);

alter table public.intake_batches enable row level security;
alter table public.source_documents enable row level security;
alter table public.source_document_texts enable row level security;
create policy intake_batches_read on public.intake_batches for select to authenticated using ((select private.has_permission(company_id, 'org.manage')));
create policy source_documents_read on public.source_documents for select to authenticated using ((select private.has_permission(company_id, 'org.manage')));
create policy source_document_texts_read on public.source_document_texts for select to authenticated using ((select private.has_permission(company_id, 'org.manage')));
revoke all on public.intake_batches, public.source_documents, public.source_document_texts from anon, authenticated;
grant select on public.intake_batches, public.source_documents, public.source_document_texts to authenticated;
create trigger audit_source_documents after insert or update or delete on public.source_documents for each row execute function private.audit_row();

/** Server-side guard mirroring the browser's list of sensitive names (web/lib/doc-classify.ts). */
create or replace function private.sensitive_name(p_name text) returns boolean
language sql immutable set search_path = '' as $$
  with n as (select regexp_replace(coalesce(p_name, ''), '[_.-]+', ' ', 'g') t)
  select t ~* '\m(aadha+r|pan card|passport|voter id|bank statement|cancelled cheque|kyc\w*|payslip|pay slip|resume|cv|police|fir)\M'
      or (t ~* ('\m(court|summons|arbitrat\w*|advocate|lawyer|criminal|demand notice|legal notice|settlement deed'
                '|salary|ctc|increment|appraisal letter|loan|full and final|gratuity'
                '|warning|show ?cause|disciplinary|suspension|terminat\w*|absconding|misconduct'
                '|medical|health|hospital|pregnan\w*|maternity|resignation|relieving)\M')
          and t !~* '\m(polic(y|ies)|sop|procedures?|guidelines?|manuals?|handbooks?|templates?|formats?|forms?|checklists?|frameworks?)\M')
  from n
$$;

create or replace function private.intake_member(p_company uuid) returns uuid
language plpgsql stable security definer set search_path = '' as $$
declare v uuid;
begin
  if not private.has_permission(p_company, 'org.manage') then raise exception 'PPI_FORBIDDEN: company administrators only' using errcode = '42501'; end if;
  select id into v from public.memberships where company_id = p_company and user_id = auth.uid() and status = 'active';
  if v is null then raise exception 'PPI_FORBIDDEN: not a member' using errcode = '42501'; end if;
  return v;
end $$;
revoke all on function private.intake_member(uuid), private.sensitive_name(text) from public, anon, authenticated;

create or replace function public.intake_begin(p_company uuid, p_label text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_me uuid := private.intake_member(p_company); v_id uuid;
begin
  insert into public.intake_batches (company_id, label, created_by) values (p_company, left(trim(p_label), 200), v_me) returning id into v_id;
  return v_id;
end $$;

/** Which of these fingerprints are already in (the browser skips reading them again). */
create or replace function public.intake_known(p_company uuid, p_hashes text[]) returns text[]
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.intake_member(p_company);
  return coalesce((select array_agg(sha256) from public.source_documents where company_id = p_company and sha256 = any(p_hashes)), '{}');
end $$;

/** Registers up to 200 files. Returns [{sha256, id, status: added|duplicate, category}]. */
create or replace function public.intake_add(p_company uuid, p_batch uuid, p_docs jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_me uuid := private.intake_member(p_company); d jsonb; v_id uuid; v_cat text; out jsonb := '[]'::jsonb;
begin
  if jsonb_typeof(p_docs) <> 'array' or jsonb_array_length(p_docs) > 200 then raise exception 'PPI_INTAKE: send at most 200 files at a time' using errcode = 'P0001'; end if;
  if p_batch is not null and not exists (select 1 from public.intake_batches where company_id = p_company and id = p_batch) then
    raise exception 'PPI_NOT_FOUND: batch' using errcode = 'P0002';
  end if;
  for d in select * from jsonb_array_elements(p_docs) loop
    v_cat := case when private.sensitive_name(d->>'file_name') then 'sensitive' else coalesce(d->>'category', 'record') end;
    insert into public.source_documents (company_id, batch_id, sha256, file_name, folder, ext, size_bytes, file_modified_at, category, doc_type,
      department_code, reason, read_status, unreadable_reason, pages, uploaded_by)
    values (p_company, p_batch, lower(d->>'sha256'), left(d->>'file_name', 300), left(coalesce(d->>'folder', ''), 500), left(lower(coalesce(d->>'ext', '')), 12),
      coalesce((d->>'size_bytes')::bigint, 0), (d->>'file_modified_at')::timestamptz, v_cat,
      case when v_cat = 'sensitive' and coalesce(d->>'category', '') <> 'sensitive' then 'personal or legal record' else left(coalesce(d->>'doc_type', 'other'), 60) end,
      nullif(d->>'department_code', ''),
      case when v_cat = 'sensitive' and coalesce(d->>'category', '') <> 'sensitive' then 'Name suggests a personal or legal record (server check)' else left(d->>'reason', 300) end,
      case when d->>'read_status' = 'unreadable' then 'unreadable' else 'not_read' end, left(d->>'unreadable_reason', 200), (d->>'pages')::int, v_me)
    on conflict (company_id, sha256) do nothing
    returning id into v_id;
    if v_id is null then
      select id, category into v_id, v_cat from public.source_documents where company_id = p_company and sha256 = lower(d->>'sha256');
      out := out || jsonb_build_object('sha256', lower(d->>'sha256'), 'id', v_id, 'status', 'duplicate', 'category', v_cat);
    else
      out := out || jsonb_build_object('sha256', lower(d->>'sha256'), 'id', v_id, 'status', 'added', 'category', v_cat);
    end if;
    v_id := null;
  end loop;
  return out;
end $$;

/** Stores the text of a governing document and queues it for analysis. Refused for records and sensitive records. */
create or replace function public.intake_put_text(p_company uuid, p_document uuid, p_body text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_cat text; v_name text;
begin
  perform private.intake_member(p_company);
  select category, file_name into v_cat, v_name from public.source_documents where company_id = p_company and id = p_document;
  if v_cat is null then raise exception 'PPI_NOT_FOUND: document' using errcode = 'P0002'; end if;
  if v_cat <> 'governing' or private.sensitive_name(v_name) then
    raise exception 'PPI_INTAKE: only governing documents may send their text' using errcode = '42501';
  end if;
  if length(coalesce(trim(p_body), '')) < 20 then
    update public.source_documents set read_status = 'unreadable', unreadable_reason = 'No readable text (scanned image?)', updated_at = now()
     where company_id = p_company and id = p_document;
    return;
  end if;
  insert into public.source_document_texts (document_id, company_id, body) values (p_document, p_company, left(p_body, 400000))
  on conflict (document_id) do update set body = excluded.body, created_at = now();
  update public.source_documents set read_status = 'read', unreadable_reason = null, text_chars = least(length(p_body), 400000),
    analysis_status = case when analysis_status in ('done', 'running') then analysis_status else 'queued' end, updated_at = now()
   where company_id = p_company and id = p_document;
end $$;

/** Admin corrects a category / type / department. Leaving "governing" deletes the text and stops analysis. */
create or replace function public.intake_set_category(p_company uuid, p_document uuid, p_category text, p_doc_type text default null, p_department text default null) returns text
language plpgsql security definer set search_path = '' as $$
declare v_name text; v_read text;
begin
  perform private.intake_member(p_company);
  select file_name, read_status into v_name, v_read from public.source_documents where company_id = p_company and id = p_document;
  if v_name is null then raise exception 'PPI_NOT_FOUND: document' using errcode = 'P0002'; end if;
  if p_category = 'governing' and private.sensitive_name(v_name) then
    raise exception 'PPI_INTAKE: this name looks like a personal or legal record; rename the file if it really is a rule document' using errcode = 'P0001';
  end if;
  update public.source_documents set category = p_category, doc_type = coalesce(left(p_doc_type, 60), doc_type),
    department_code = coalesce(nullif(p_department, ''), department_code), reason = 'Changed by an administrator',
    analysis_status = case when p_category = 'governing' then analysis_status else 'not_needed' end,
    read_status = case when p_category = 'governing' then read_status else 'not_read' end,
    text_chars = case when p_category = 'governing' then text_chars else 0 end, updated_at = now()
   where company_id = p_company and id = p_document;
  if p_category <> 'governing' then delete from public.source_document_texts where company_id = p_company and document_id = p_document; end if;
  return case when p_category = 'governing' and v_read <> 'read' then 'Add the file again so its text can be read.' else 'Saved.' end;
end $$;

revoke all on function public.intake_begin(uuid, text), public.intake_known(uuid, text[]), public.intake_add(uuid, uuid, jsonb),
  public.intake_put_text(uuid, uuid, text), public.intake_set_category(uuid, uuid, text, text, text) from public, anon;
grant execute on function public.intake_begin(uuid, text), public.intake_known(uuid, text[]), public.intake_add(uuid, uuid, jsonb),
  public.intake_put_text(uuid, uuid, text), public.intake_set_category(uuid, uuid, text, text, text) to authenticated;
