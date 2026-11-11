-- PPI-014 Phase 2 completion (DB side): invitation acceptance (FR-01) and private evidence storage (FR-09).
--
-- Invitation flow:
--   1. A server action holding membership.manage calls Supabase Auth admin inviteUserByEmail (creates auth.users row),
--      then inserts public.memberships (status 'invited') — RLS: memberships_write requires membership.manage.
--   2. The invitee signs in and calls rpc('accept_membership', {p_company}) → status 'active'.
--   An invited (not yet active) member has no permissions: private.my_membership() only returns active memberships.
--
-- Evidence storage:
--   Bucket 'evidence-private' (never public). Object path convention: <company_id>/<evidence_file_id>/<file name>.
--   The metadata row in public.evidence_files must exist first (with sha256, size, classification); an object may be
--   uploaded only to a path registered there by the same uploader, and read only by someone who can read that row.
--   No update/delete policies: stored evidence is immutable.

-- Invitation acceptance -------------------------------------------------------------------
create or replace function public.accept_membership(p_company uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'PPI_AUTH: sign in before accepting an invitation' using errcode = '42501';
  end if;
  update public.memberships
     set status = 'active'
   where company_id = p_company and user_id = (select auth.uid()) and status = 'invited'
     and (valid_to is null or valid_to > now())
  returning id into v_id;
  if v_id is null then
    raise exception 'PPI_INVITE: no pending invitation for this account in this company' using errcode = 'P0001';
  end if;
  return v_id;
end $$;
revoke all on function public.accept_membership(uuid) from public, anon;
grant execute on function public.accept_membership(uuid) to authenticated;

-- A signed-in person may see their own membership rows (incl. pending invitations) and the company they were invited to.
create or replace function private.has_any_membership(p_company uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.memberships m where m.company_id = p_company and m.user_id = (select auth.uid())
                  and m.status in ('invited','active'))
$$;
grant execute on function private.has_any_membership(uuid) to authenticated, service_role;

create policy memberships_self_read on public.memberships for select to authenticated
  using (user_id = (select auth.uid()));
create policy companies_invited_read on public.companies for select to authenticated
  using ((select private.has_any_membership(id)));

-- Evidence storage -------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('evidence-private', 'evidence-private', false, 26214400,
        array['application/pdf','image/png','image/jpeg','image/webp','text/plain','text/csv',
              'application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document',
              'application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'])
on conflict (id) do nothing;

create or replace function private.can_read_evidence_object(p_bucket text, p_name text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.evidence_files e
                  where e.storage_bucket = p_bucket and e.storage_path = p_name
                    and private.can_read_evidence(e.company_id, e.id))
$$;
create or replace function private.can_upload_evidence_object(p_bucket text, p_name text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.evidence_files e
                  where e.storage_bucket = p_bucket and e.storage_path = p_name
                    and e.uploaded_by_membership_id = private.my_membership(e.company_id))
$$;
grant execute on function private.can_read_evidence_object(text, text) to authenticated, service_role;
grant execute on function private.can_upload_evidence_object(text, text) to authenticated, service_role;

create policy ppi_evidence_read on storage.objects for select to authenticated
  using (bucket_id = 'evidence-private' and (select private.can_read_evidence_object(bucket_id, name)));
create policy ppi_evidence_upload on storage.objects for insert to authenticated
  with check (bucket_id = 'evidence-private' and (select private.can_upload_evidence_object(bucket_id, name)));
-- No update / delete policies for evidence-private: uploaded evidence cannot be replaced or removed by users.
