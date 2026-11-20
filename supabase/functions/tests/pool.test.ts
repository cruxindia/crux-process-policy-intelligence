// Platform AI pool — pure tests. Run: node --experimental-strip-types --test supabase/functions/tests/pool.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { allowedPolicies, choosePoolKeys, MeteredProvider, type PoolKey } from "../_shared/pool.ts";
import { extractJson, OpenAICompatProvider, retryAfterSeconds, scrub } from "../_shared/openai-compat.ts";

const k = (id: string, provider: string, extra: Partial<PoolKey> = {}): PoolKey => ({ id, provider, policy_provider: `${provider}_free`, label: id, model: "m",
  base_url: null, priority: 100, status: "active", health: "connected", cooldown_until: null, vault_secret_id: "v-" + id, ...extra });
const pol = (provider: string, max: string, status = "active") => ({ provider, max_classification: max, status });

test("one key per provider, stable per company", () => {
  const keys = [k("g1", "gemini"), k("g2", "gemini"), k("g3", "gemini"), k("q1", "groq")];
  const allowed = new Set(["gemini_free", "groq_free"]);
  const a = choosePoolKeys(keys, allowed, "company-A");
  assert.equal(a.length, 2); assert.deepEqual(new Set(a.map((x) => x.provider)), new Set(["gemini", "groq"]));
  assert.deepEqual(choosePoolKeys(keys, allowed, "company-A").map((x) => x.id), a.map((x) => x.id), "same company → same keys");
  const spreadIds = new Set(["A", "B", "C", "D", "E", "F", "G", "H"].map((c) => choosePoolKeys(keys, allowed, c).find((x) => x.provider === "gemini")!.id));
  assert.ok(spreadIds.size >= 2, "different companies are spread over the keys");
});

test("a resting key is NOT replaced by a sibling key of the same provider", () => {
  const keys = [k("g1", "gemini"), k("g2", "gemini"), k("q1", "groq")];
  const allowed = new Set(["gemini_free", "groq_free"]);
  const chosen = choosePoolKeys(keys, allowed, "co-1").find((x) => x.provider === "gemini")!;
  const resting = keys.map((x) => x.id === chosen.id ? { ...x, cooldown_until: new Date(Date.now() + 60_000).toISOString() } : x);
  const after = choosePoolKeys(resting, allowed, "co-1");
  assert.deepEqual(after.map((x) => x.provider), ["groq"], "gemini skipped entirely; the request moves to another provider");
});

test("policy and health filters", () => {
  const keys = [k("g1", "gemini"), k("q1", "groq", { health: "auth_failed" }), k("m1", "mistral", { status: "disabled" }), k("c1", "cerebras", { vault_secret_id: null })];
  assert.deepEqual(choosePoolKeys(keys, new Set(["gemini_free", "groq_free", "mistral_free", "cerebras_free"]), "x").map((x) => x.id), ["g1"]);
  const p = [pol("gemini_free", "public"), pol("groq_free", "internal"), pol("mistral_free", "confidential", "disabled")];
  assert.deepEqual([...allowedPolicies(p, "internal")], ["groq_free"], "internal data: training tiers excluded");
  assert.deepEqual([...allowedPolicies(p, "public")].sort(), ["gemini_free", "groq_free"]);
  assert.deepEqual([...allowedPolicies(p, "confidential")], []);
});

const resp = (status: number, body: unknown, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });

test("OpenAI-compatible: success, JSON extraction, no key in request URL", async () => {
  let seen: { url: string; init: RequestInit } | null = null;
  const p = new OpenAICompatProvider("https://api.example.invalid/v1/", "gsk_secretsecretsecret1234", "m1", "groq_free", async (url, init) => {
    seen = { url, init }; return resp(200, { model: "m1", choices: [{ message: { content: "```json\n{\"ok\": true}\n```" } }], usage: { prompt_tokens: 5, completion_tokens: 3 } });
  });
  const r = await p.generateJson({ system: "s", user: "u", schema: { type: "object" } });
  assert.ok(r.ok); if (r.ok) { assert.equal(r.text, '{"ok": true}'); assert.equal(r.usage?.input, 5); }
  assert.equal(seen!.url, "https://api.example.invalid/v1/chat/completions");
  assert.ok(!seen!.url.includes("gsk_"));
  assert.equal((seen!.init.headers as Record<string, string>).authorization, "Bearer gsk_secretsecretsecret1234");
  assert.match(JSON.parse(String(seen!.init.body)).messages[0].content, /JSON Schema/);
});

test("OpenAI-compatible: retries without JSON mode when the model does not support it", async () => {
  const bodies: any[] = [];
  const p = new OpenAICompatProvider("https://x.invalid/v1", "k".repeat(30), "m", "p", async (_u, init) => {
    bodies.push(JSON.parse(String(init.body)));
    return bodies.length === 1 ? resp(400, { error: { message: "response_format json_object is not supported" } }) : resp(200, { choices: [{ message: { content: "{}" } }] });
  });
  const r = await p.generateJson({ system: "s", user: "u", schema: {} });
  assert.ok(r.ok); assert.ok(bodies[0].response_format); assert.equal(bodies[1].response_format, undefined);
});

test("OpenAI-compatible: error classes, rate-limit wait, scrubbed detail", async () => {
  const mk = (status: number, body: unknown, h: Record<string, string> = {}) => new OpenAICompatProvider("https://x.invalid/v1", "k".repeat(30), "m", "p", async () => resp(status, body, h), 0);
  const a = await mk(401, { error: { message: "Invalid API Key gsk_abcdefghijklmnopqrstu" } }).generateJson({ system: "", user: "", schema: {} });
  assert.ok(!a.ok); if (!a.ok) { assert.equal(a.errorClass, "auth"); assert.ok(!a.detail!.includes("gsk_abc")); }
  const b = await mk(429, { error: { message: "Rate limit reached for requests per minute" } }, { "retry-after": "37" }).generateJson({ system: "", user: "", schema: {} });
  assert.ok(!b.ok); if (!b.ok) { assert.equal(b.errorClass, "rate_limit"); assert.match(b.message, /about 37 seconds/); }
  const c = await mk(429, { error: { message: "Rate limit reached for requests per day (RPD)" } }).generateJson({ system: "", user: "", schema: {} });
  assert.ok(!c.ok); if (!c.ok) assert.match(c.message, /daily limit/);
  const d = await mk(404, { error: { message: "The model `m` does not exist" } }).generateJson({ system: "", user: "", schema: {} });
  assert.ok(!d.ok); if (!d.ok) assert.equal(d.errorClass, "config");
});

test("helpers", () => {
  assert.equal(retryAfterSeconds(new Headers({ "x-ratelimit-reset-requests": "2m59.5s" })), 179.5);
  assert.equal(retryAfterSeconds(new Headers({ "retry-after": "12" })), 12);
  assert.ok(Number.isNaN(retryAfterSeconds(new Headers())));
  assert.equal(scrub("bad key sk-or-v1-abcdefghijklmnopqrstuvwxyz and Bearer xyz123"), "bad key [key] and Bearer [key]");
  assert.equal(extractJson('Sure! {"a":1} done'), '{"a":1}');
});

test("metered provider records outcome and cooldown on the pool key", async () => {
  const calls: any[] = [];
  const svc = { rpc: async (fn: string, args: Record<string, unknown>) => { calls.push({ fn, args }); return { data: null, error: null }; }, from: () => null };
  const inner = { name: "groq_free", model: "m", generateJson: async () => ({ ok: false as const, errorClass: "rate_limit" as const, status: 429, message: "please try again in about 30 seconds" }) };
  const r = await new MeteredProvider(inner, svc, "key-1").generateJson({ system: "", user: "", schema: {} });
  assert.ok(!r.ok);
  assert.equal(calls[0].fn, "ai_pool_mark"); assert.equal(calls[0].args.p_health, "rate_limited");
  const wait = Date.parse(calls[0].args.p_cooldown) - Date.now(); assert.ok(wait > 25_000 && wait < 35_000, String(wait));
});
