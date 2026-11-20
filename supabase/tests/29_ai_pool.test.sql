-- PPI-040: platform AI key pool — Vault storage, duplicates refused, owner-only visibility, usage marks, removal, provider policies.
begin;
select plan(17);

insert into auth.users (id, email) values (tests.uid('platform_owner'), 'platform_owner@example.invalid');
insert into private.platform_admins (user_id) values (tests.uid('platform_owner'));
select private.ensure_pool_policies(id) from public.companies;

-- server side (service role) adds keys
select is((public.ai_pool_add_key('groq', 'groq_free', 'Groq 1', 'llama-3.3-70b-versatile', 'https://api.groq.com/openai/v1', 'gsk_SyntheticPoolKey0001abcdefghij', tests.uid('platform_owner')) ->> 'ok')::boolean,
          true, 'a key is added to the pool');
select is(public.ai_pool_add_key('groq', 'groq_free', 'Groq dup', 'x-model', null, '  gsk_SyntheticPoolKey0001abcdefghij ', null) ->> 'reason',
          'already in the pool', 'the same key twice is refused (fingerprint)');
select is(public.ai_pool_add_key('groq', 'groq_free', 'Bad', 'x-model', null, 'short', null) ->> 'reason', 'does not look like an API key', 'obvious non-keys are refused');
select is((select key_hint || '/' || health from public.ai_pool_keys where label = 'Groq 1'), 'ghij/configured', 'only the last 4 characters are kept beside the Vault reference');
select is(public.ai_pool_get_key((select id from public.ai_pool_keys where label = 'Groq 1')), 'gsk_SyntheticPoolKey0001abcdefghij', 'the server reads the key from Vault');
select ok(not exists (select 1 from public.ai_pool_keys k where k.key_hash = 'gsk_SyntheticPoolKey0001abcdefghij'), 'the key itself is not in the table');

-- usage and health
select public.ai_pool_mark((select id from public.ai_pool_keys where label = 'Groq 1'), true, 'connected');
select public.ai_pool_mark((select id from public.ai_pool_keys where label = 'Groq 1'), false, 'rate_limited', 'rate_limit', now() + interval '60 seconds');
select is((select uses_today || '/' || health || '/' || (cooldown_until > now())::text from public.ai_pool_keys where label = 'Groq 1'), '2/rate_limited/true', 'uses are counted and a rate limit sets a cooldown');
select public.ai_pool_mark((select id from public.ai_pool_keys where label = 'Groq 1'), true, 'connected', null, null, array['m1', 'm2'], true);
select is((select uses_today || '/' || array_length(available_models, 1) from public.ai_pool_keys where label = 'Groq 1'), '2/2', 'a test is not counted as use; available models stored');

-- visibility and privileges
select tests.login('a_admin'); set local role authenticated;
select is((select count(*)::int from public.ai_pool_keys), 0, 'company administrators cannot see the platform pool');
select throws_ok($$ select public.ai_pool_get_key((select id from public.ai_pool_keys limit 1)) $$, '42501', null, 'no browser can read a pool key');
select throws_ok($$ select public.ai_pool_add_key('groq', 'groq_free', 'x', 'm', null, 'gsk_SyntheticPoolKey0002abcdefghij', null) $$, '42501', null, 'no browser can add keys directly');
select throws_ok($$ select public.platform_ai_pool_update((select id from public.ai_pool_keys limit 1), 'x', null, null, null) $$, '42501', null, 'only the platform owner changes keys');
reset role;
select tests.login('platform_owner'); set local role authenticated;
select is((select count(*)::int from public.ai_pool_keys), 1, 'the platform owner sees the pool');
select lives_ok($$ select public.platform_ai_pool_update((select id from public.ai_pool_keys where label = 'Groq 1'), 'Groq main', 'llama-3.1-8b-instant', 50, null) $$, 'owner changes label, model, priority');
select lives_ok($$ select public.platform_ai_pool_remove((select id from public.ai_pool_keys where label = 'Groq main')) $$, 'owner removes the key');
reset role;
select is((select health || '/' || status || '/' || (vault_secret_id is null)::text from public.ai_pool_keys where label = 'Groq main'), 'removed/disabled/true',
          'removed: the Vault secret is deleted, the row stays as history');

-- provider policies for pool providers
select is((select string_agg(provider || ':' || max_classification, ',' order by provider) from public.ai_provider_policies
            where company_id = tests.company('ALPHA') and provider in ('cerebras_free', 'groq_free', 'mistral_free', 'openrouter_free')),
          'cerebras_free:public,groq_free:internal,mistral_free:public,openrouter_free:public', 'training or unverified free tiers get public data only');

select * from finish();
rollback;
