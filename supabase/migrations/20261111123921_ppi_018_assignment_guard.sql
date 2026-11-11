-- PPI-018 Interview assignment guard.
-- Closes a gap: respondents could previously edit their own assignment's scope (department/process),
-- which also changes who can read the session, or mark it completed without submitting.
create or replace function private.interview_assignment_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_system  boolean := (select auth.uid()) is null;   -- trusted backend (service_role / migrations), no end-user JWT
  v_manager boolean;
  v_started boolean;
  v_open    boolean;
  v_done    boolean;
begin
  if new.company_id <> old.company_id or new.campaign_id <> old.campaign_id
     or new.respondent_membership_id <> old.respondent_membership_id then
    raise exception 'PPI_IMMUTABLE: campaign and respondent of an assignment cannot change' using errcode = 'P0001';
  end if;

  v_manager := v_system or private.has_permission(old.company_id, 'interview.manage', old.department_id, old.process_id);
  select exists (select 1 from public.interview_sessions s where s.company_id = old.company_id and s.assignment_id = old.id),
         exists (select 1 from public.interview_sessions s where s.company_id = old.company_id and s.assignment_id = old.id
                    and s.status in ('in_progress','reopened')),
         exists (select 1 from public.interview_sessions s where s.company_id = old.company_id and s.assignment_id = old.id
                    and s.status in ('submitted','review_pending','reviewed','closed'))
    into v_started, v_open, v_done;

  if (new.department_id, new.process_id) is distinct from (old.department_id, old.process_id) then
    if v_started then
      raise exception 'PPI_IMMUTABLE: interview scope cannot change after the interview has started' using errcode = 'P0001';
    end if;
    if not (v_system or (v_manager and private.has_permission(new.company_id, 'interview.manage', new.department_id, new.process_id))) then
      raise exception 'PPI_FORBIDDEN: only a campaign manager for both scopes can move an assignment' using errcode = 'P0001';
    end if;
  end if;

  perform private.assert_transition('interview_assignment', old.status, new.status, array[
    'invited>accepted','invited>declined','accepted>declined','invited>in_progress','accepted>in_progress',
    'in_progress>completed','completed>in_progress',
    'invited>cancelled','accepted>cancelled','in_progress>cancelled',
    'invited>expired','accepted>expired','in_progress>expired']);

  if new.status is distinct from old.status then
    if new.status in ('cancelled','expired') and not v_manager then
      raise exception 'PPI_FORBIDDEN: only a campaign manager can cancel or expire an assignment' using errcode = 'P0001';
    end if;
    if new.status in ('accepted','declined')
       and not v_system and old.respondent_membership_id is distinct from private.my_membership(old.company_id) then
      raise exception 'PPI_FORBIDDEN: only the respondent can accept or decline' using errcode = 'P0001';
    end if;
    if new.status = 'completed' and (v_open or not v_done) then
      raise exception 'PPI_INTERVIEW: submit the interview before marking it completed' using errcode = 'P0001';
    end if;
    if old.status = 'completed' and new.status = 'in_progress' and not v_open then
      raise exception 'PPI_INTERVIEW: an interview returns to in progress only when its session is reopened' using errcode = 'P0001';
    end if;
  end if;
  return new;
end $$;
revoke all on function private.interview_assignment_guard() from public, anon;

create trigger interview_assignments_guard before update on public.interview_assignments
  for each row execute function private.interview_assignment_guard();
