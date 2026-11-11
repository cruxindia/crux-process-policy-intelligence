-- PPI-016 Custom access token hook: every token issued by Supabase Auth to a person carries actor_type = 'user'.
-- private.is_human_actor() requires this claim AND a human membership, so human-only actions
-- (review, verify, approve, decide) work in the app. Service identities never sign in through Supabase Auth;
-- they receive separately minted tokens with actor_type = 'service' (ADR-011/ADR-019).
-- Activation is a project setting: Authentication → Hooks → Custom Access Token → public.custom_access_token_hook.
create or replace function public.custom_access_token_hook(event jsonb) returns jsonb
language plpgsql stable set search_path = '' as $$
declare v_claims jsonb := coalesce(event -> 'claims', '{}'::jsonb);
begin
  v_claims := jsonb_set(v_claims, '{actor_type}', to_jsonb('user'::text), true);
  return jsonb_set(event, '{claims}', v_claims, true);
end $$;

grant usage on schema public to supabase_auth_admin;
grant execute on function public.custom_access_token_hook(jsonb) to supabase_auth_admin;
revoke execute on function public.custom_access_token_hook(jsonb) from public, anon, authenticated, service_role;
