// Platform AI key pool (PPI-040, D-095). Used after a company's own connections and before the server default key.
// Compliance rule: ONE key per provider per company (stable choice). If that key is resting after a rate limit, the
// provider is skipped for this company — the request never moves to another key of the same provider.
import { GeminiProvider, type AiProvider, type AiResult } from "./ai-provider.ts";
import { OpenAICompatProvider, POOL_PROVIDERS, type PoolProviderKind } from "./openai-compat.ts";
import { cooldownFor, healthFor, spread } from "./routing.ts";

export type PoolKey = { id: string; provider: string; policy_provider: string; label: string; model: string; base_url: string | null;
  priority: number; status: string; health: string; cooldown_until: string | null; vault_secret_id: string | null };
const RANK: Record<string, number> = { public: 0, internal: 1, confidential: 2, restricted: 3 };
const UNUSABLE = new Set(["auth_failed", "model_unavailable", "removed", "not_configured"]);

/** Pure: which pool keys this company may use now, one per provider, best first. */
export function choosePoolKeys(keys: PoolKey[], allowedPolicies: Set<string>, companyId: string, now = Date.now()): PoolKey[] {
  const byProvider = new Map<string, PoolKey[]>();
  for (const k of keys) {
    if (k.status !== "active" || !k.vault_secret_id || UNUSABLE.has(k.health) || !allowedPolicies.has(k.policy_provider)) continue;
    byProvider.set(k.provider, [...(byProvider.get(k.provider) ?? []), k]);
  }
  const chosen: PoolKey[] = [];
  for (const [, ks] of byProvider) {
    // The choice ignores cooldowns on purpose: a resting key is NOT replaced by a sibling key of the same provider.
    const pick = [...ks].sort((a, b) => spread(companyId + "|" + a.id) - spread(companyId + "|" + b.id))[0]!;
    if (pick.cooldown_until && Date.parse(pick.cooldown_until) > now) continue;
    chosen.push(pick);
  }
  return chosen.sort((a, b) => a.priority - b.priority || a.provider.localeCompare(b.provider));
}

/** Policies of this company that may receive data of this classification. */
export function allowedPolicies(policies: { provider: string; max_classification: string; status: string }[], classification: string) {
  return new Set(policies.filter((p) => p.status === "active" && (RANK[p.max_classification] ?? -1) >= (RANK[classification] ?? 9)).map((p) => p.provider));
}

export function makeProvider(k: Pick<PoolKey, "provider" | "model" | "base_url" | "policy_provider">, apiKey: string): AiProvider {
  if (k.provider === "gemini") return new GeminiProvider(apiKey, k.model, k.policy_provider);
  const base = k.base_url || POOL_PROVIDERS[k.provider as PoolProviderKind]?.baseUrl || "";
  return new OpenAICompatProvider(base, apiKey, k.model, k.policy_provider);
}

type Db = { rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }>; from: (t: string) => any };

/** Records every outcome on the pool key (health, cooldown from the provider's own retry time, usage count). */
export class MeteredProvider implements AiProvider {
  private inner: AiProvider; private svc: Db; private keyId: string;
  constructor(inner: AiProvider, svc: Db, keyId: string) { this.inner = inner; this.svc = svc; this.keyId = keyId; }
  get name() { return this.inner.name; }
  get model() { return this.inner.model; }
  async generateJson(req: Parameters<AiProvider["generateJson"]>[0]): Promise<AiResult> {
    const r = await this.inner.generateJson(req);
    const cd = r.ok ? null : cooldownFor(r.errorClass === "rate_limit" ? "rate_limit" : "", r.message);
    await this.svc.rpc("ai_pool_mark", { p_id: this.keyId, p_ok: r.ok, p_health: r.ok ? "connected" : r.errorClass === "timeout" ? "provider_error" : healthFor(false, r.errorClass, r.status),
      p_error_class: r.ok ? null : r.errorClass, p_cooldown: cd ? cd.toISOString() : null });
    return r;
  }
}

/** Pool candidates for one company and data classification (at most `max`, each from a different provider). */
export async function poolCandidates(svc: Db, companyId: string, classification: string, max = 2): Promise<{ provider: AiProvider; connectionId: null; label: string }[]> {
  const [{ data: pol }, { data: keys }] = await Promise.all([
    svc.from("ai_provider_policies").select("provider, max_classification, status").eq("company_id", companyId),
    svc.from("ai_pool_keys").select("id, provider, policy_provider, label, model, base_url, priority, status, health, cooldown_until, vault_secret_id").eq("status", "active"),
  ]);
  const chosen = choosePoolKeys((keys ?? []) as PoolKey[], allowedPolicies((pol ?? []) as any[], classification), companyId).slice(0, max);
  const out: { provider: AiProvider; connectionId: null; label: string }[] = [];
  for (const k of chosen) {
    const { data: key } = await svc.rpc("ai_pool_get_key", { p_id: k.id });
    if (key) out.push({ provider: new MeteredProvider(makeProvider(k, String(key)), svc, k.id), connectionId: null, label: `Platform pool · ${k.label}` });
  }
  return out;
}

/** Models the key can use (for the console's model list). Gemini lists generateContent models; others use /models. */
export async function listModels(k: Pick<PoolKey, "provider" | "base_url">, apiKey: string, fetchImpl: typeof fetch = fetch): Promise<string[] | null> {
  try {
    if (k.provider === "gemini") {
      const res = await fetchImpl(`${POOL_PROVIDERS.gemini.baseUrl}/models?pageSize=100`, { headers: { "x-goog-api-key": apiKey } });
      if (!res.ok) return null;
      const j: any = await res.json();
      return (j?.models ?? []).filter((m: any) => (m.supportedGenerationMethods ?? []).includes("generateContent"))
        .map((m: any) => String(m.name).replace(/^models\//, "")).slice(0, 60);
    }
    return await new OpenAICompatProvider(k.base_url || POOL_PROVIDERS[k.provider as PoolProviderKind]?.baseUrl || "", apiKey, "x", "x", fetchImpl).listModels();
  } catch { return null; }
}
