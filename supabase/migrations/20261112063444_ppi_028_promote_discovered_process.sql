-- PPI-028: a reviewer turns an AI-discovered process into an entry of the governed process catalogue (status 'candidate'),
-- or links it to an existing catalogue process. Same rights as adding a process (process.edit in the owning department)
-- plus the right to read that conversation. AI output never enters the catalogue without this human step.
create or replace function public.promote_discovered_process(p_company uuid, p_discovered uuid, p_code text, p_owner_department uuid,
                                                             p_classification text default 'internal', p_existing_process uuid default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare d record; v_pid uuid; v_code text := upper(trim(coalesce(p_code, '')));
begin
  if not private.is_human_actor(p_company) then
    raise exception 'PPI_FORBIDDEN: only people can add processes to the catalogue' using errcode = '42501';
  end if;
  select * into d from public.discovered_processes where company_id = p_company and id = p_discovered for update;
  if not found or not private.can_read_session(p_company, d.session_id) then
    raise exception 'PPI_INPUT: discovered process not found' using errcode = 'P0001';
  end if;
  if d.linked_process_id is not null then
    raise exception 'PPI_INPUT: this process is already in the catalogue' using errcode = 'P0001';
  end if;
  if p_existing_process is not null then
    if not private.has_permission(p_company, 'process.edit', null, p_existing_process) then
      raise exception 'PPI_FORBIDDEN: you cannot edit that catalogue process' using errcode = '42501';
    end if;
    select id into v_pid from public.processes where company_id = p_company and id = p_existing_process;
    if v_pid is null then raise exception 'PPI_INPUT: catalogue process not found' using errcode = 'P0001'; end if;
  else
    if v_code !~ '^[A-Z0-9][A-Z0-9_-]{1,31}$' then
      raise exception 'PPI_INPUT: process code must be 2-32 letters, digits, - or _' using errcode = 'P0001';
    end if;
    if p_classification not in ('public', 'internal', 'confidential', 'restricted') then
      raise exception 'PPI_INPUT: choose a classification' using errcode = 'P0001';
    end if;
    if not private.has_permission(p_company, 'process.edit', p_owner_department) then
      raise exception 'PPI_FORBIDDEN: you cannot add processes for that department' using errcode = '42501';
    end if;
    insert into public.processes (company_id, code, name, purpose, owner_department_id, classification, status)
    values (p_company, v_code, d.name, d.purpose, p_owner_department, p_classification, 'candidate')
    returning id into v_pid;
  end if;
  update public.discovered_processes set linked_process_id = v_pid, updated_at = now() where company_id = p_company and id = p_discovered;
  insert into public.audit_events (company_id, actor_user_id, actor_type, action, object_type, object_id, changed_fields)
  values (p_company, (select auth.uid()), 'user', case when p_existing_process is null then 'DISCOVERED_PROCESS_PROMOTED' else 'DISCOVERED_PROCESS_LINKED' end,
          'discovered_processes', p_discovered::text, array['linked_process_id']);
  return v_pid;
end $$;
revoke all on function public.promote_discovered_process(uuid, uuid, text, uuid, text, uuid) from public, anon;
grant execute on function public.promote_discovered_process(uuid, uuid, text, uuid, text, uuid) to authenticated;
