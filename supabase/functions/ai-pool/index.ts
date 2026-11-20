// ai-pool — Supabase Edge Function (Deno). Platform owner only (PPI-040, D-095).
//   {action:"add", provider, label, model?, base_url?, keys: string[]}  store keys in Vault (duplicates refused), then test each
//   {action:"test", id? }                                                 real request through one key (or every active key)
// Keys arrive once over HTTPS from the owner's browser, go straight to Vault, and are never returned or logged.
// "Connected and tested" is shown only after a real generation round-trip.
import { createClient } from "npm:@supabase/supabase-js@2.118.0";
import { POOL_PROVIDERS, type PoolProviderKind } from "../_shared/openai-compat.ts";
import { listModels, makeProvider, type PoolKey } from "../_shared/pool.ts";
import { cooldownFor, healthFor, HEALTH_LABEL } from "../_shared/routing.ts";

const ALLOWED = (Deno.env.get("ALLOWED_ORIGINS") ?? "https://crux-ppi.netlify.app,http://localhost:3000").split(",");
const cors = (o: string | null) => ({ "access-control-allow-origin": o && ALLOWED.includes(o) ? o : ALLOWED[0]!,
  "access-control-allow-headers": "authorization, x-client-info, apikey, content-type", "access-control-allow-methods": "POST, OPTIONS", vary: "origin" });
function apiKey(dictVar: string, legacy: string) {
  try { const o = JSON.parse(Deno.env.get(dictVar) ?? ""); const k = o.default ?? Object.values(o)[0]; if (typeof k === "string" && k) return k; } catch { /* unset */ }
  return Deno.env.get(legacy) ?? "";
}
const log = (event: string, d: Record<string, unknown>) => console.log(JSON.stringify({ fn: "ai-pool", event, ...d }));
const MAX_KEYS = 50;
// deno-lint-ignore no-explicit-any
type Db = any;

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "content-type": "application/json", ...cors(origin) } });
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(origin) });
  if (req.method !== "POST") return json({ ok: false, error: { message: "POST only" } }, 405);
  const url = Deno.env.get("SUPABASE_URL")!;
  const auth = req.headers.get("authorization") ?? "";
  const userDb = createClient(url, apiKey("SUPABASE_PUBLISHABLE_KEYS", "SUPABASE_ANON_KEY"), { global: { headers: { Authorization: auth } }, auth: { persistSession: false } });
  const svc = createClient(url, apiKey("SUPABASE_SECRET_KEYS", "SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });
  const { data: u } = await userDb.auth.getUser(auth.replace(/^Bearer\s+/i, ""));
  if (!u?.user) return json({ ok: false, error: { message: "Sign in again." } }, 401);
  const { data: owner } = await userDb.rpc("am_platform_admin");
  if (owner !== true) return json({ ok: false, error: { message: "Only the platform owner can manage the AI pool." } }, 403);
  let body: { action?: string; provider?: string; label?: string; model?: string; base_url?: string; keys?: unknown; id?: string } = {};
  try { body = await req.json(); } catch { /* empty */ }

  if (body.action === "add") {
    const kind = body.provider as PoolProviderKind;
    const def = POOL_PROVIDERS[kind];
    if (!def) return json({ ok: false, error: { message: "Choose a provider." } }, 400);
    const model = (body.model ?? "").trim() || def.model; const base = (body.base_url ?? "").trim() || def.baseUrl || "";
    if (!model) return json({ ok: false, error: { message: "Give the model name." } }, 400);
    if (kind === "openai_compat" && !/^https:\/\//.test(base)) return json({ ok: false, error: { message: "Give the endpoint's https:// base URL." } }, 400);
    const keys = [...new Set((Array.isArray(body.keys) ? body.keys : []).map((k) => String(k).trim()).filter(Boolean))];
    if (!keys.length) return json({ ok: false, error: { message: "Paste at least one key (one per line)." } }, 400);
    if (keys.length > MAX_KEYS) return json({ ok: false, error: { message: `At most ${MAX_KEYS} keys at a time.` } }, 400);
    const label = (body.label ?? "").trim() || def.label;
    const { count } = await svc.from("ai_pool_keys").select("id", { count: "exact", head: true }).eq("provider", kind);
    const results: { hint: string; added: boolean; reason?: string; health?: string; label?: string }[] = [];
    let n = count ?? 0;
    for (const k of keys) {
      const { data, error } = await svc.rpc("ai_pool_add_key", { p_provider: kind, p_policy: def.policy, p_label: `${label} ${++n}`, p_model: model,
        p_base_url: kind === "gemini" ? null : base, p_key: k, p_actor: u.user.id });
      const r = data as { ok: boolean; id?: string; reason?: string } | null;
      if (error || !r?.ok) { n--; results.push({ hint: `…${k.slice(-4)}`, added: false, reason: r?.reason ?? "could not be stored" }); continue; }
      const t = await testKey(svc, r.id!);
      results.push({ hint: `…${k.slice(-4)}`, added: true, health: t.health, label: t.label });
    }
    log("keys_added", { provider: kind, submitted: keys.length, added: results.filter((r) => r.added).length });
    return json({ ok: true, results });
  }

  if (body.action === "test") {
    const ids = body.id ? [body.id] : ((await svc.from("ai_pool_keys").select("id").eq("status", "active")).data ?? []).map((r: { id: string }) => r.id);
    const out = [];
    for (const id of ids.slice(0, 60)) out.push({ id, ...(await testKey(svc, id)) });
    return json({ ok: true, results: out });
  }
  return json({ ok: false, error: { message: "Unknown action." } }, 400);
});

/** A real, tiny generation through the key. Marks health; lists the key's models when the model is not available. */
async function testKey(svc: Db, id: string): Promise<{ health: string; label: string; latency_ms?: number; models?: string[] }> {
  const { data: k } = await svc.from("ai_pool_keys").select("id, provider, policy_provider, label, model, base_url, priority, status, health, cooldown_until, vault_secret_id").eq("id", id).maybeSingle();
  if (!k || k.health === "removed") return { health: "removed", label: "Removed" };
  const { data: key } = await svc.rpc("ai_pool_get_key", { p_id: id });
  if (!key) { await svc.rpc("ai_pool_mark", { p_id: id, p_ok: false, p_health: "not_configured", p_error_class: "config", p_is_test: true }); return { health: "not_configured", label: HEALTH_LABEL.not_configured }; }
  const r = await makeProvider(k as PoolKey, String(key)).generateJson({ system: "Reply with JSON only.", user: 'Return {"ok": true}.',
    schema: { type: "object", properties: { ok: { type: "boolean" } }, required: ["ok"] }, timeoutMs: 20000, maxOutputTokens: 40 });
  const health = r.ok ? "connected" : r.errorClass === "timeout" ? "provider_error" : healthFor(false, r.errorClass, r.status);
  const models = (r.ok || health === "model_unavailable") ? await listModels(k as PoolKey, String(key)) : null;
  const cd = r.ok ? null : cooldownFor(r.errorClass === "rate_limit" ? "rate_limit" : "", r.message);
  await svc.rpc("ai_pool_mark", { p_id: id, p_ok: r.ok, p_health: health, p_error_class: r.ok ? null : r.errorClass, p_cooldown: cd ? cd.toISOString() : null,
    p_models: models, p_is_test: true });
  log("key_tested", { key: id, provider: k.provider, ok: r.ok, errorClass: r.ok ? null : r.errorClass, status: r.ok ? null : r.status, detail: r.ok ? null : r.detail });
  return { health, label: HEALTH_LABEL[health] ?? health, ...(r.ok ? { latency_ms: r.latencyMs } : {}), ...(models ? { models: models.slice(0, 20) } : {}) };
}
