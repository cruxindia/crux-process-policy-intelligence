-- PPI-041: Document API + website embed (D-096).
-- * A company administrator (org.manage) creates API keys (shown ONCE; only a SHA-256 hash is stored) and RELEASES approved
--   expert-board documents for external use. Nothing is reachable unless released.
-- * API (server-to-server, key in a header): released documents classified public or internal.
-- * Website embed (no key, because a web page cannot keep a secret): only releases marked "public embed", and only public documents.
-- * Never confidential or restricted. The classification is re-checked on every call. Every call is logged (no content).

create table public.company_api_keys (
  id                     uuid not null default gen_random_uuid() primary key,
  company_id             uuid not null references public.companies(id),
  name                   text not null check (length(trim(name)) between 2 and 80),
  key_prefix             text not null,
  key_hash               text not null unique check (key_hash ~ '^[0-9a-f]{64}$'),
  created_by_membership_id uuid,
  created_at             timestamptz not null default now(),
  last_used_at           timestamptz,
  calls_total            bigint not null default 0,
  revoked_at             timestamptz,
  revoked_by_membership_id uuid,
  unique (company_id, id)
);
create index company_api_keys_company_idx on public.company_api_keys (company_id);

create table public.document_releases (
  id                        uuid not null default gen_random_uuid() primary key,
  company_id                uuid not null references public.companies(id),
  case_id                   uuid not null,
  slug                      text not null check (slug ~ '^[a-z0-9][a-z0-9-]{1,62}$'),
  public_embed              boolean not null default false,
  released_by_membership_id uuid not null,
  released_at               timestamptz not null default now(),
  revoked_at                timestamptz,
  calls_total               bigint not null default 0,
  unique (company_id, id),
  foreign key (company_id, case_id) references public.board_cases(company_id, id)
);
create unique index document_releases_slug_live on public.document_releases (company_id, slug) where revoked_at is null;
create unique index document_releases_case_live on public.document_releases (case_id) where revoked_at is null;
create index document_releases_case_idx on public.document_releases (company_id, case_id);

create table public.document_api_calls (
  id          bigint generated always as identity primary key,
  company_id  uuid references public.companies(id),
  key_id      uuid references public.company_api_keys(id),
  release_id  uuid references public.document_releases(id),
  endpoint    text not null check (endpoint in ('list', 'get', 'embed')),
  status      smallint not null,
  at          timestamptz not null default now()
);
create index document_api_calls_key_at on public.document_api_calls (key_id, at);
create index document_api_calls_release_at on public.document_api_calls (release_id, at);
create index document_api_calls_company_at on public.document_api_calls (company_id, at);
create trigger document_api_calls_append_only before update or delete on public.document_api_calls for each row execute function private.forbid_mutation();
create trigger audit_company_api_keys after insert or update on public.company_api_keys for each row execute function private.audit_row();
create trigger audit_document_releases after insert or update on public.document_releases for each row execute function private.audit_row();

alter table public.company_api_keys enable row level security;
alter table public.document_releases enable row level security;
alter table public.document_api_calls enable row level security;
create policy company_api_keys_read on public.company_api_keys for select to authenticated using ((select private.has_permission(company_id, 'org.manage')));
create policy document_releases_read on public.document_releases for select to authenticated using ((select private.has_permission(company_id, 'org.manage')));
create policy document_api_calls_read on public.document_api_calls for select to authenticated using ((select private.has_permission(company_id, 'org.manage')));
revoke all on public.company_api_keys, public.document_releases, public.document_api_calls from anon;
revoke insert, update, delete, truncate, references, trigger on public.company_api_keys, public.document_releases, public.document_api_calls from authenticated;
grant select on public.document_releases, public.document_api_calls to authenticated;
revoke select on public.company_api_keys from authenticated;
grant select (id, company_id, name, key_prefix, created_by_membership_id, created_at, last_used_at, calls_total, revoked_at, revoked_by_membership_id)
  on public.company_api_keys to authenticated;   -- not the hash

-- ---- company administrator RPCs ----
create or replace function public.company_create_api_key(p_company uuid, p_name text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_key text; v_id uuid; v_mid uuid;
begin
  if not private.has_permission(p_company, 'org.manage') then raise exception 'PPI_FORBIDDEN: company administrators only' using errcode = '42501'; end if;
  if (select count(*) from public.company_api_keys where company_id = p_company and revoked_at is null) >= 10 then
    raise exception 'PPI_INPUT: at most 10 active keys; revoke one you no longer use' using errcode = 'P0001'; end if;
  select id into v_mid from public.memberships where company_id = p_company and user_id = auth.uid();
  v_key := 'ppi_' || encode(extensions.gen_random_bytes(24), 'hex');
  insert into public.company_api_keys (company_id, name, key_prefix, key_hash, created_by_membership_id)
  values (p_company, trim(p_name), left(v_key, 12), encode(extensions.digest(v_key, 'sha256'), 'hex'), v_mid) returning id into v_id;
  return jsonb_build_object('id', v_id, 'key', v_key, 'prefix', left(v_key, 12));
end $$;

create or replace function public.company_revoke_api_key(p_company uuid, p_key uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not private.has_permission(p_company, 'org.manage') then raise exception 'PPI_FORBIDDEN: company administrators only' using errcode = '42501'; end if;
  update public.company_api_keys set revoked_at = now(),
    revoked_by_membership_id = (select id from public.memberships where company_id = p_company and user_id = auth.uid())
   where id = p_key and company_id = p_company and revoked_at is null;
  if not found then raise exception 'PPI_INPUT: key not found or already revoked' using errcode = 'P0001'; end if;
end $$;

create or replace function public.company_release_document(p_company uuid, p_case uuid, p_slug text, p_public_embed boolean default false) returns uuid
language plpgsql security definer set search_path = '' as $$
declare c record; v_id uuid; v_slug text := lower(trim(coalesce(p_slug, '')));
begin
  if not private.has_permission(p_company, 'org.manage') then raise exception 'PPI_FORBIDDEN: company administrators only' using errcode = '42501'; end if;
  select * into c from public.board_cases where id = p_case and company_id = p_company;
  if c.id is null then raise exception 'PPI_INPUT: document not found' using errcode = 'P0001'; end if;
  if c.status <> 'approved' then raise exception 'PPI_INPUT: only an approved document can be released' using errcode = 'P0001'; end if;
  if c.classification not in ('public', 'internal') then
    raise exception 'PPI_INPUT: % documents are never released outside the platform', c.classification using errcode = 'P0001'; end if;
  if coalesce(p_public_embed, false) and c.classification <> 'public' then
    raise exception 'PPI_INPUT: only documents classified public can be embedded on a website (internal ones: API only)' using errcode = 'P0001'; end if;
  if v_slug !~ '^[a-z0-9][a-z0-9-]{1,62}$' then raise exception 'PPI_INPUT: the web name uses lower-case letters, digits and hyphens (2-63)' using errcode = 'P0001'; end if;
  update public.document_releases set slug = v_slug, public_embed = coalesce(p_public_embed, false)
   where case_id = p_case and revoked_at is null returning id into v_id;
  if v_id is null then
    insert into public.document_releases (company_id, case_id, slug, public_embed, released_by_membership_id)
    values (p_company, p_case, v_slug, coalesce(p_public_embed, false), (select id from public.memberships where company_id = p_company and user_id = auth.uid()))
    returning id into v_id;
  end if;
  return v_id;
exception when unique_violation then
  raise exception 'PPI_INPUT: that web name is already used by another released document' using errcode = 'P0001';
end $$;

create or replace function public.company_revoke_release(p_company uuid, p_release uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not private.has_permission(p_company, 'org.manage') then raise exception 'PPI_FORBIDDEN: company administrators only' using errcode = '42501'; end if;
  update public.document_releases set revoked_at = now() where id = p_release and company_id = p_company and revoked_at is null;
  if not found then raise exception 'PPI_INPUT: release not found' using errcode = 'P0001'; end if;
end $$;

revoke all on function public.company_create_api_key(uuid, text), public.company_revoke_api_key(uuid, uuid),
  public.company_release_document(uuid, uuid, text, boolean), public.company_revoke_release(uuid, uuid) from public, anon;
grant execute on function public.company_create_api_key(uuid, text), public.company_revoke_api_key(uuid, uuid),
  public.company_release_document(uuid, uuid, text, boolean), public.company_revoke_release(uuid, uuid) to authenticated;

-- ---- the API itself (service role; called by the doc-api Edge Function) ----
-- p_key: the API key as sent (hashed here), or null for the public embed (then p_company_code + p_slug are required).
-- Returns {status, ...}: 200 with data, 401 bad key, 404 not released / not allowed, 429 too many calls.
create or replace function public.doc_api(p_key text, p_company_code text, p_slug text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare k record; r record; v_kid uuid; v_company uuid; v_status int; v_out jsonb; v_endpoint text;
begin
  v_endpoint := case when p_key is null then 'embed' when p_slug is null then 'list' else 'get' end;
  if p_key is not null then
    select * into k from public.company_api_keys where key_hash = encode(extensions.digest(p_key, 'sha256'), 'hex') and revoked_at is null;
    if k.id is null then return jsonb_build_object('status', 401, 'error', 'Invalid or revoked API key'); end if;
    v_company := k.company_id; v_kid := k.id;
    if (select count(*) from public.document_api_calls where key_id = k.id and at > now() - interval '1 minute') >= 120 then
      insert into public.document_api_calls (company_id, key_id, endpoint, status) values (v_company, k.id, v_endpoint, 429);
      return jsonb_build_object('status', 429, 'error', 'Too many requests (120 per minute per key)', 'retry_after', 60);
    end if;
    update public.company_api_keys set last_used_at = now(), calls_total = calls_total + 1 where id = k.id;
  else
    select id into v_company from public.companies where code = upper(trim(coalesce(p_company_code, ''))) and status in ('trial', 'active');
    if v_company is null then return jsonb_build_object('status', 404, 'error', 'Not found'); end if;
  end if;

  if v_endpoint = 'list' then
    select coalesce(jsonb_agg(jsonb_build_object('slug', d.slug, 'title', o.title, 'type', bc.doc_type, 'classification', bc.classification,
             'version', o.version, 'approved_at', bc.decided_at, 'embeddable', d.public_embed) order by d.slug), '[]')
      into v_out
      from public.document_releases d join public.board_cases bc on bc.id = d.case_id
      join lateral (select title, version from public.board_outputs bo where bo.case_id = d.case_id order by version desc limit 1) o on true
     where d.company_id = v_company and d.revoked_at is null and bc.status = 'approved' and bc.classification in ('public', 'internal');
    insert into public.document_api_calls (company_id, key_id, endpoint, status) values (v_company, v_kid, 'list', 200);
    return jsonb_build_object('status', 200, 'documents', v_out);
  end if;

  select d.id, d.public_embed, bc.classification, bc.status as case_status, bc.doc_type, bc.decided_at, o.title, o.body_md, o.version
    into r
    from public.document_releases d join public.board_cases bc on bc.id = d.case_id
    left join lateral (select title, body_md, version from public.board_outputs bo where bo.case_id = d.case_id order by version desc limit 1) o on true
   where d.company_id = v_company and d.slug = lower(trim(coalesce(p_slug, ''))) and d.revoked_at is null;
  v_status := case when r.id is null or r.case_status <> 'approved' or r.body_md is null then 404
                   when r.classification not in ('public', 'internal') then 404
                   when v_endpoint = 'embed' and not (r.public_embed and r.classification = 'public') then 404
                   else 200 end;
  if v_endpoint = 'embed' and r.id is not null and v_status = 200
     and (select count(*) from public.document_api_calls where release_id = r.id and at > now() - interval '1 minute') >= 300 then v_status := 429; end if;
  insert into public.document_api_calls (company_id, key_id, release_id, endpoint, status) values (v_company, v_kid, r.id, v_endpoint, v_status);
  if v_status <> 200 then return jsonb_build_object('status', v_status, 'error', case when v_status = 429 then 'Too many requests' else 'Not found' end); end if;
  update public.document_releases set calls_total = calls_total + 1 where id = r.id;
  return jsonb_build_object('status', 200, 'document', jsonb_build_object('slug', lower(trim(p_slug)), 'title', r.title, 'type', r.doc_type,
    'classification', r.classification, 'version', r.version, 'approved_at', r.decided_at, 'body_markdown', r.body_md));
end $$;
revoke all on function public.doc_api(text, text, text) from public, anon, authenticated;
grant execute on function public.doc_api(text, text, text) to service_role;
