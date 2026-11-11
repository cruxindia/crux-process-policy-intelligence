-- Access token hook adds actor_type = 'user'; only Supabase Auth may call it.
begin;
select plan(5);
select is(public.custom_access_token_hook('{"user_id":"x","claims":{"sub":"x","role":"authenticated"}}'::jsonb) #>> '{claims,actor_type}',
          'user', 'hook adds actor_type = user');
select is(public.custom_access_token_hook('{"claims":{"sub":"x","actor_type":"service"}}'::jsonb) #>> '{claims,actor_type}',
          'user', 'a client-supplied actor_type is overwritten');
select is(public.custom_access_token_hook('{"claims":{"sub":"x","role":"authenticated"}}'::jsonb) #>> '{claims,sub}',
          'x', 'existing claims are preserved');
select ok(has_function_privilege('supabase_auth_admin', 'public.custom_access_token_hook(jsonb)', 'execute'), 'Supabase Auth can call the hook');
select ok(not has_function_privilege('authenticated', 'public.custom_access_token_hook(jsonb)', 'execute')
      and not has_function_privilege('anon', 'public.custom_access_token_hook(jsonb)', 'execute'), 'API roles cannot call the hook');
select * from finish();
rollback;
