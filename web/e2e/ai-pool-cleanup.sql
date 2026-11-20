-- After e2e/ai-pool.cjs (hosted, as owner): delete the synthetic keys (added by the E2E lead) and their Vault secrets,
-- then revoke the temporary platform-owner grant.
delete from vault.secrets where id in (select vault_secret_id from public.ai_pool_keys where created_by = 'e2e00000-0000-4000-8000-00000000000a');
delete from public.ai_pool_keys where created_by = 'e2e00000-0000-4000-8000-00000000000a';
delete from private.platform_admins where user_id = 'e2e00000-0000-4000-8000-00000000000a';
