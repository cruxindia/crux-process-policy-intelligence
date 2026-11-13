-- PPI-031: consolidation. Many people describe the same work in their own interviews; the company keeps ONE catalogue item
-- (process / SOP / policy) that collects every description as a source. Each interview process belongs to at most one company item.
-- Matches are suggested by name similarity and confirmed by a person; documents and improvement reviews are made from ALL sources.
create extension if not exists pg_trgm with schema extensions;

create table public.catalogue_item_sources (
  id                     uuid not null default gen_random_uuid(),
  company_id             uuid not null references public.companies(id),
  item_id                uuid not null,
  discovered_process_id  uuid not null,
  method                 text not null default 'manual' check (method in ('manual', 'suggested')),
  linked_by              uuid not null,
  linked_at              timestamptz not null default now(),
  primary key (id), unique (company_id, id),
  unique (company_id, discovered_process_id),                 -- one interview process -> one company item
  foreign key (company_id, item_id) references public.catalogue_items(company_id, id),
  foreign key (company_id, discovered_process_id) references public.discovered_processes(company_id, id)
);
create index catalogue_sources_item_idx on public.catalogue_item_sources (company_id, item_id);
create trigger audit_catalogue_sources after insert or update or delete on public.catalogue_item_sources for each row execute function private.audit_row();

alter table public.catalogue_item_sources enable row level security;
-- A source row is visible to whoever may read the underlying conversation (interview content stays protected).
create policy catalogue_sources_read on public.catalogue_item_sources for select to authenticated using (
  exists (select 1 from public.discovered_processes d where d.company_id = catalogue_item_sources.company_id
           and d.id = catalogue_item_sources.discovered_process_id and (select private.can_read_session(d.company_id, d.session_id))));
revoke insert, update, delete, truncate, references, trigger on public.catalogue_item_sources from authenticated, anon;
grant select on public.catalogue_item_sources to authenticated;

-- Contributor count per item without exposing interview content (any member may see how many descriptions exist).
create or replace function public.catalogue_source_counts(p_company uuid)
returns table (item_id uuid, contributors int) language sql stable security definer set search_path = '' as $$
  select s.item_id, count(*)::int from public.catalogue_item_sources s
   where s.company_id = p_company and private.my_membership(p_company) is not null group by s.item_id
$$;
revoke all on function public.catalogue_source_counts(uuid) from public, anon;
grant execute on function public.catalogue_source_counts(uuid) to authenticated;

create or replace function private.catalogue_can_curate(p_company uuid, p_item uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.has_permission_anywhere(p_company, 'catalogue.manage')
      or exists (select 1 from public.catalogue_items i join public.catalogue_functions f on f.company_id = i.company_id and f.id = i.function_id
                  where i.company_id = p_company and i.id = p_item and f.department_id is not null
                    and private.has_permission(p_company, 'process.edit', f.department_id))
$$;
revoke all on function private.catalogue_can_curate(uuid, uuid) from public, anon, authenticated;

-- Link (or move) an interview process to a company item. Being described in an interview is evidence the work is done today.
create or replace function public.catalogue_link_source(p_company uuid, p_item uuid, p_discovered uuid, p_method text default 'manual')
returns void language plpgsql security definer set search_path = '' as $$
declare v_mid uuid := private.my_membership(p_company); v_sess uuid;
begin
  if v_mid is null or not private.is_human_actor(p_company) then raise exception 'PPI_FORBIDDEN: people only' using errcode = '42501'; end if;
  if not exists (select 1 from public.catalogue_items where company_id = p_company and id = p_item and status = 'active') then
    raise exception 'PPI_INPUT: catalogue item not found' using errcode = 'P0001'; end if;
  if not private.catalogue_can_curate(p_company, p_item) then
    raise exception 'PPI_FORBIDDEN: only catalogue managers or the owning department can link descriptions' using errcode = '42501'; end if;
  select session_id into v_sess from public.discovered_processes where company_id = p_company and id = p_discovered;
  if v_sess is null or not private.can_read_session(p_company, v_sess) then
    raise exception 'PPI_INPUT: interview process not found' using errcode = 'P0001'; end if;
  if p_method not in ('manual', 'suggested') then raise exception 'PPI_INPUT: unknown method' using errcode = 'P0001'; end if;
  insert into public.catalogue_item_sources (company_id, item_id, discovered_process_id, method, linked_by)
  values (p_company, p_item, p_discovered, p_method, v_mid)
  on conflict (company_id, discovered_process_id) do update set item_id = excluded.item_id, method = excluded.method,
     linked_by = excluded.linked_by, linked_at = now();
  update public.catalogue_items set process_status = case when process_status = 'unknown' then 'performed' else process_status end,
         status_updated_by = v_mid, status_updated_at = now()
   where company_id = p_company and id = p_item;
end $$;

create or replace function public.catalogue_unlink_source(p_company uuid, p_discovered uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_item uuid;
begin
  if private.my_membership(p_company) is null or not private.is_human_actor(p_company) then
    raise exception 'PPI_FORBIDDEN: people only' using errcode = '42501'; end if;
  select item_id into v_item from public.catalogue_item_sources where company_id = p_company and discovered_process_id = p_discovered;
  if v_item is null then raise exception 'PPI_INPUT: not linked' using errcode = 'P0001'; end if;
  if not private.catalogue_can_curate(p_company, v_item) then
    raise exception 'PPI_FORBIDDEN: only catalogue managers or the owning department can unlink' using errcode = '42501'; end if;
  delete from public.catalogue_item_sources where company_id = p_company and discovered_process_id = p_discovered;
end $$;

-- Suggestions for unlinked interview processes the caller may read: the closest process/SOP item by name, with a boost for items whose
-- function is owned by the interviewee's department (invoker rights => RLS applies; a hidden assignment simply gets no boost).
create or replace function public.catalogue_match_suggestions(p_company uuid, p_min numeric default 0.2)
returns table (discovered_process_id uuid, process_name text, session_id uuid, item_id uuid, item_code text, item_title text, score numeric)
language sql stable security invoker set search_path = '' as $$
  select d.id, d.name, d.session_id, m.id, m.code, m.title, round(m.score::numeric, 2)
    from public.discovered_processes d
    left join public.interview_sessions s on s.company_id = d.company_id and s.id = d.session_id
    left join public.interview_assignments a on a.company_id = s.company_id and a.id = s.assignment_id
    left join lateral (
      select i.id, i.code, i.title,
             extensions.similarity(lower(d.name), lower(i.title)) + case when f.department_id = a.department_id then 0.15 else 0 end as score
        from public.catalogue_items i join public.catalogue_functions f on f.company_id = i.company_id and f.id = i.function_id
       where i.company_id = d.company_id and i.status = 'active' and i.kind in ('process', 'sop')
       order by 4 desc, i.code limit 1) m on m.score >= p_min
   where d.company_id = p_company and d.status <> 'removed'
     and not exists (select 1 from public.catalogue_item_sources x where x.company_id = d.company_id and x.discovered_process_id = d.id)
   order by m.score desc nulls last, d.name
$$;
revoke all on function public.catalogue_match_suggestions(uuid, numeric) from public, anon;
grant execute on function public.catalogue_match_suggestions(uuid, numeric) to authenticated;

-- Existing single links become sources.
insert into public.catalogue_item_sources (company_id, item_id, discovered_process_id, method, linked_by)
select i.company_id, i.id, i.discovered_process_id, 'manual', coalesce(i.status_updated_by, i.created_by)
  from public.catalogue_items i
 where i.discovered_process_id is not null and coalesce(i.status_updated_by, i.created_by) is not null
on conflict do nothing;

-- One company document needs every description: allow up to 25 interview processes per board case.
create or replace function public.open_board_case(p_company uuid, p_kind text, p_doc_type text, p_title text, p_brief text,
                                                  p_process_ids uuid[], p_classification text default 'internal')
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_mid uuid := private.my_membership(p_company); v_id uuid; v_pid uuid; v_sess uuid;
begin
  if v_mid is null or not private.is_human_actor(p_company) then
    raise exception 'PPI_FORBIDDEN: only people can open a board case' using errcode = '42501';
  end if;
  if p_kind = 'improvement_review' then
    if not (private.has_permission_anywhere(p_company, 'interview.review') or private.has_permission_anywhere(p_company, 'process.edit')
            or private.has_permission_anywhere(p_company, 'org.manage')) then
      raise exception 'PPI_FORBIDDEN: reviewers only' using errcode = '42501';
    end if;
    if coalesce(cardinality(p_process_ids), 0) = 0 then
      raise exception 'PPI_INPUT: choose at least one process to review' using errcode = 'P0001';
    end if;
  elsif p_kind = 'document_draft' then
    if not (private.has_permission_anywhere(p_company, 'document.draft') or private.has_permission_anywhere(p_company, 'org.manage')) then
      raise exception 'PPI_FORBIDDEN: you cannot draft documents' using errcode = '42501';
    end if;
  else
    raise exception 'PPI_INPUT: unknown case kind' using errcode = 'P0001';
  end if;
  if coalesce(cardinality(p_process_ids), 0) > 25 then raise exception 'PPI_INPUT: at most 25 processes per case' using errcode = 'P0001'; end if;
  foreach v_pid in array coalesce(p_process_ids, '{}') loop
    select session_id into v_sess from public.discovered_processes where company_id = p_company and id = v_pid;
    if v_sess is null or not private.can_read_session(p_company, v_sess) then
      raise exception 'PPI_INPUT: a selected process was not found' using errcode = 'P0001';
    end if;
  end loop;
  if p_classification in ('confidential', 'restricted') and not (private.has_permission_anywhere(p_company, 'classified.confidential_read')
                                                                   or private.has_permission_anywhere(p_company, 'org.manage')) then
    raise exception 'PPI_FORBIDDEN: you cannot open confidential cases' using errcode = '42501';
  end if;
  insert into public.board_cases (company_id, kind, doc_type, title, brief, source_process_ids, classification, created_by_membership_id)
  values (p_company, p_kind, case when p_kind = 'document_draft' then coalesce(p_doc_type, 'other') end, trim(p_title), coalesce(trim(p_brief), ''),
          coalesce(p_process_ids, '{}'), coalesce(p_classification, 'internal'), v_mid)
  returning id into v_id;
  return v_id;
end $$;

revoke all on function public.catalogue_link_source(uuid, uuid, uuid, text) from public, anon;
revoke all on function public.catalogue_unlink_source(uuid, uuid) from public, anon;
grant execute on function public.catalogue_link_source(uuid, uuid, uuid, text) to authenticated;
grant execute on function public.catalogue_unlink_source(uuid, uuid) to authenticated;

-- The item page's "Described in an interview as" also records a source (same rules as catalogue_link_source).
create or replace function public.catalogue_set_status(p_company uuid, p_item uuid, p_process_status text, p_process_note text,
  p_document_status text, p_document_note text, p_discovered_process uuid default null, p_process uuid default null)
returns void language plpgsql security definer set search_path = '' as $$
declare v_mid uuid := private.my_membership(p_company); v_dept uuid; v_sess uuid;
begin
  if v_mid is null or not private.is_human_actor(p_company) then raise exception 'PPI_FORBIDDEN: people only' using errcode = '42501'; end if;
  select f.department_id into v_dept from public.catalogue_items i join public.catalogue_functions f on f.company_id = i.company_id and f.id = i.function_id
   where i.company_id = p_company and i.id = p_item;
  if not found then raise exception 'PPI_INPUT: item not found' using errcode = 'P0001'; end if;
  if not (private.has_permission_anywhere(p_company, 'catalogue.manage')
          or (v_dept is not null and private.has_permission(p_company, 'process.edit', v_dept))) then
    raise exception 'PPI_FORBIDDEN: only catalogue managers or the owning department can update this' using errcode = '42501';
  end if;
  if p_process_status not in ('unknown', 'not_performed', 'partial', 'performed')
     or p_document_status not in ('unknown', 'none', 'exists_outside', 'draft', 'in_review', 'approved', 'outdated') then
    raise exception 'PPI_INPUT: unknown status' using errcode = 'P0001'; end if;
  if p_discovered_process is not null then
    select session_id into v_sess from public.discovered_processes where company_id = p_company and id = p_discovered_process;
    if v_sess is null or not private.can_read_session(p_company, v_sess) then
      raise exception 'PPI_INPUT: discovered process not found' using errcode = 'P0001'; end if;
  end if;
  if p_process is not null and not exists (select 1 from public.processes where company_id = p_company and id = p_process) then
    raise exception 'PPI_INPUT: catalogue process not found' using errcode = 'P0001'; end if;
  update public.catalogue_items set process_status = p_process_status, process_note = nullif(trim(p_process_note), ''),
         document_status = p_document_status, document_note = nullif(trim(p_document_note), ''),
         discovered_process_id = coalesce(p_discovered_process, discovered_process_id), process_id = coalesce(p_process, process_id),
         status_updated_by = v_mid, status_updated_at = now()
   where company_id = p_company and id = p_item;
  if p_discovered_process is not null then
    insert into public.catalogue_item_sources (company_id, item_id, discovered_process_id, method, linked_by)
    values (p_company, p_item, p_discovered_process, 'manual', v_mid)
    on conflict (company_id, discovered_process_id) do update set item_id = excluded.item_id, linked_by = excluded.linked_by, linked_at = now();
  end if;
end $$;
