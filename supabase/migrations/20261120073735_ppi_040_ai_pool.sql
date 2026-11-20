-- PPI-040: platform AI key pool (D-095). The platform owner uploads free (or paid) API keys for several providers in bulk.
-- * Keys live only in Supabase Vault; the table holds the Vault id, a SHA-256 fingerprint (to refuse duplicates) and the
--   last 4 characters. Reading a key is service_role only (Edge Functions).
-- * Pool keys are used after a company's own connections and before the server default key.
-- * Compliance: one key per provider per request (chosen per company, stable) — a rate limit never moves the request to
--   another key of the same provider; it moves to another provider or waits. A company's provider policy decides which
--   providers may receive which data (training providers: public only, unless the company accepted otherwise).

create table public.ai_pool_keys (
  id                uuid primary key default gen_random_uuid(),
  provider          text not null check (provider in ('gemini', 'groq', 'openrouter', 'cerebras', 'mistral', 'openai_compat')),
  policy_provider   text not null check (policy_provider ~ '^[a-z0-9_]{3,40}$'),
  label             text not null check (length(trim(label)) between 2 and 80),
  model             text not null check (length(model) between 2 and 120),
  base_url          text check (base_url is null or base_url ~ '^https://'),
  priority          smallint not null default 100 check (priority between 1 and 1000),
  status            text not null default 'active' check (status in ('active', 'disabled')),
  vault_secret_id   uuid,
  key_hash          text not null unique check (key_hash ~ '^[0-9a-f]{64}$'),
  key_hint          text not null check (length(key_hint) <= 8),
  health            text not null default 'untested' check (health in ('untested', 'not_configured', 'configured', 'connected', 'auth_failed',
                                                                         'model_unavailable', 'rate_limited', 'provider_error', 'removed')),
  last_tested_at    timestamptz,
  last_success_at   timestamptz,
  last_error_class  text,
  last_error_at     timestamptz,
  cooldown_until    timestamptz,
  uses_day          date,
  uses_today        int not null default 0,
  uses_total        bigint not null default 0,
  available_models  text[] not null default '{}',
  created_by        uuid,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index ai_pool_keys_provider_idx on public.ai_pool_keys (provider, status);
create trigger ai_pool_keys_updated before update on public.ai_pool_keys for each row execute function private.set_updated_at();
alter table public.ai_pool_keys enable row level security;
create policy ai_pool_keys_read on public.ai_pool_keys for select to authenticated using ((select private.is_platform_admin()));
revoke all on public.ai_pool_keys from anon;
revoke insert, update, delete, truncate, references, trigger on public.ai_pool_keys from authenticated;
grant select on public.ai_pool_keys to authenticated;

-- Service role (Edge Function) only: add one key (refuses duplicates), read a key, record an outcome.
create or replace function public.ai_pool_add_key(p_provider text, p_policy text, p_label text, p_model text, p_base_url text, p_key text, p_actor uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_hash text; v_id uuid; v_secret uuid;
begin
  if p_key is null or length(trim(p_key)) < 20 or length(trim(p_key)) > 400 or trim(p_key) ~ '\s' then
    return jsonb_build_object('ok', false, 'reason', 'does not look like an API key');
  end if;
  v_hash := encode(extensions.digest(trim(p_key), 'sha256'), 'hex');
  select id into v_id from public.ai_pool_keys where key_hash = v_hash;
  if v_id is not null then return jsonb_build_object('ok', false, 'id', v_id, 'reason', 'already in the pool'); end if;
  v_id := gen_random_uuid();
  v_secret := vault.create_secret(trim(p_key), 'ppi_pool_' || v_id::text, 'PPI platform AI pool key');
  insert into public.ai_pool_keys (id, provider, policy_provider, label, model, base_url, vault_secret_id, key_hash, key_hint, health, created_by)
  values (v_id, p_provider, p_policy, p_label, p_model, nullif(trim(coalesce(p_base_url, '')), ''), v_secret, v_hash, right(trim(p_key), 4), 'configured', p_actor);
  insert into private.platform_events (actor, action, detail) values (p_actor, 'ai_pool.key_added', jsonb_build_object('key', v_id, 'provider', p_provider));
  return jsonb_build_object('ok', true, 'id', v_id);
end $$;

create or replace function public.ai_pool_get_key(p_id uuid) returns text
language sql stable security definer set search_path = '' as $$
  select s.decrypted_secret from public.ai_pool_keys k join vault.decrypted_secrets s on s.id = k.vault_secret_id
   where k.id = p_id and k.status = 'active'
$$;

create or replace function public.ai_pool_mark(p_id uuid, p_ok boolean, p_health text, p_error_class text default null,
                                               p_cooldown timestamptz default null, p_models text[] default null, p_is_test boolean default false)
returns void language plpgsql security definer set search_path = '' as $$
declare d date := (now() at time zone 'Asia/Kolkata')::date;
begin
  update public.ai_pool_keys set
    health = p_health,
    last_tested_at = case when p_is_test then now() else last_tested_at end,
    last_success_at = case when p_ok then now() else last_success_at end,
    last_error_class = case when p_ok then null else p_error_class end,
    last_error_at = case when p_ok then last_error_at else now() end,
    cooldown_until = case when p_ok then null else p_cooldown end,
    uses_today = case when p_is_test then uses_today when uses_day = d then uses_today + 1 else 1 end,
    uses_day = case when p_is_test then uses_day else d end,
    uses_total = uses_total + case when p_is_test then 0 else 1 end,
    available_models = coalesce(p_models, available_models)
  where id = p_id;
end $$;

revoke all on function public.ai_pool_add_key(text, text, text, text, text, text, uuid), public.ai_pool_get_key(uuid),
  public.ai_pool_mark(uuid, boolean, text, text, timestamptz, text[], boolean) from public, anon, authenticated;
grant execute on function public.ai_pool_add_key(text, text, text, text, text, text, uuid), public.ai_pool_get_key(uuid),
  public.ai_pool_mark(uuid, boolean, text, text, timestamptz, text[], boolean) to service_role;

-- Platform owner: change label / model / priority / status, or remove the key from Vault (irreversible; the row stays as history).
create or replace function public.platform_ai_pool_update(p_id uuid, p_label text, p_model text, p_priority int, p_status text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_platform_admin() then raise exception 'PPI_FORBIDDEN: platform owner only' using errcode = '42501'; end if;
  update public.ai_pool_keys set label = coalesce(nullif(trim(p_label), ''), label), model = coalesce(nullif(trim(p_model), ''), model),
    priority = coalesce(p_priority, priority), status = coalesce(p_status, status),
    health = case when nullif(trim(p_model), '') is distinct from null and trim(p_model) <> model then 'configured' else health end
   where id = p_id and health <> 'removed';
  if not found then raise exception 'PPI_INPUT: key not found' using errcode = 'P0001'; end if;
  insert into private.platform_events (actor, action, detail) values (auth.uid(), 'ai_pool.key_updated', jsonb_build_object('key', p_id, 'status', p_status));
end $$;

create or replace function public.platform_ai_pool_remove(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_secret uuid;
begin
  if not private.is_platform_admin() then raise exception 'PPI_FORBIDDEN: platform owner only' using errcode = '42501'; end if;
  select vault_secret_id into v_secret from public.ai_pool_keys where id = p_id;
  if not found then raise exception 'PPI_INPUT: key not found' using errcode = 'P0001'; end if;
  update public.ai_pool_keys set status = 'disabled', health = 'removed', vault_secret_id = null, cooldown_until = null where id = p_id;
  if v_secret is not null then delete from vault.secrets where id = v_secret; end if;
  insert into private.platform_events (actor, action, detail) values (auth.uid(), 'ai_pool.key_removed', jsonb_build_object('key', p_id));
end $$;
revoke all on function public.platform_ai_pool_update(uuid, text, text, int, text), public.platform_ai_pool_remove(uuid) from public, anon;
grant execute on function public.platform_ai_pool_update(uuid, text, text, int, text), public.platform_ai_pool_remove(uuid) to authenticated;

-- Provider policies for the pool providers, per company (terms checked 20-Nov-2026; see D-095 / D-099).
-- Training (or unknown) free tiers: public data only. Groq: its "Your data" page says inference data is not retained by
-- default (abuse logs up to 30 days, zero-retention available) and does not say it trains -> internal at most.
-- openai_compat is a placeholder for a paid / private endpoint: disabled until the owner reviews its terms.
create or replace function private.ensure_pool_policies(p_company uuid) returns void
language sql security definer set search_path = '' as $$
  insert into public.ai_provider_policies (company_id, provider, max_classification, may_train_on_inputs, terms_checked_on, status, notes)
  values
    (p_company, 'groq_free', 'internal', false, '2026-11-20', 'active', 'Groq free tier: no retention by default (abuse logs ≤30 days); enable Zero Data Retention in Groq Data Controls.'),
    (p_company, 'openrouter_free', 'public', true, '2026-11-20', 'active', 'OpenRouter free models: providers may log/train depending on account settings.'),
    (p_company, 'cerebras_free', 'public', true, '2026-11-20', 'active', 'Cerebras free tier: training use not confirmed; treated as training provider.'),
    (p_company, 'mistral_free', 'public', true, '2026-11-20', 'active', 'Mistral free (Experiment) plan: data may be used for training unless opted out in the admin console.'),
    (p_company, 'openai_compat', 'internal', false, '2026-11-20', 'disabled', 'Custom OpenAI-compatible endpoint: enable after reviewing the provider''s data terms.')
  on conflict (company_id, provider) do nothing;
  insert into public.ai_provider_policies (company_id, provider, max_classification, may_train_on_inputs, terms_checked_on, status, notes)
  values (p_company, 'gemini_free', 'public', true, '2026-11-20', 'active', 'Gemini free tier: Google may use content to improve products.')
  on conflict (company_id, provider) do nothing;
$$;
revoke all on function private.ensure_pool_policies(uuid) from public, anon, authenticated;
select private.ensure_pool_policies(id) from public.companies;

-- New companies: provision_company copies the template company's policies, which now include these.
