// OpenAI-compatible chat-completions adapter (Groq, OpenRouter, Cerebras, Mistral, or a private endpoint).
// Plain HTTPS, no SDK. Never logs prompts, outputs or keys — only status and a scrubbed provider message.
import type { AiErrorClass, AiProvider, AiResult } from "./ai-provider.ts";

type FetchLike = (url: string, init: RequestInit) => Promise<Response>;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Defaults offered in the platform console. Models change over time: a test lists the models the key can actually use. */
export const POOL_PROVIDERS = {
  gemini: { label: "Google Gemini", policy: "gemini_free", baseUrl: "https://generativelanguage.googleapis.com/v1beta", model: "gemini-flash-lite-latest" },
  groq: { label: "Groq", policy: "groq_free", baseUrl: "https://api.groq.com/openai/v1", model: "llama-3.3-70b-versatile" },
  openrouter: { label: "OpenRouter (free models)", policy: "openrouter_free", baseUrl: "https://openrouter.ai/api/v1", model: "meta-llama/llama-3.3-70b-instruct:free" },
  cerebras: { label: "Cerebras", policy: "cerebras_free", baseUrl: "https://api.cerebras.ai/v1", model: "llama3.1-8b" },
  mistral: { label: "Mistral", policy: "mistral_free", baseUrl: "https://api.mistral.ai/v1", model: "mistral-small-latest" },
  openai_compat: { label: "Other OpenAI-compatible endpoint", policy: "openai_compat", baseUrl: "", model: "" },
} as const;
export type PoolProviderKind = keyof typeof POOL_PROVIDERS;

/** Remove anything key-like from a provider's error text before it is logged. */
export const scrub = (s: string) => s.replace(/(AIza|AQ\.|gsk_|sk-or-v1-|sk-|csk-)[0-9A-Za-z_.-]{12,}/g, "[key]").replace(/Bearer\s+\S+/gi, "Bearer [key]");

/** Text that should be JSON: strip code fences / leading prose the model may add. */
export function extractJson(text: string) {
  const t = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const a = t.indexOf("{"); const b = t.lastIndexOf("}");
  return a >= 0 && b > a ? t.slice(a, b + 1) : t;
}

/** Seconds to wait from provider headers (retry-after, or Groq-style "x-ratelimit-reset-requests: 2m59.56s"). */
export function retryAfterSeconds(h: Headers): number {
  const ra = Number(h.get("retry-after")); if (Number.isFinite(ra) && ra > 0) return ra;
  const r = h.get("x-ratelimit-reset-requests") ?? h.get("x-ratelimit-reset-tokens") ?? "";
  const m = /^(?:(\d+)h)?(?:(\d+)m(?!s))?(?:([\d.]+)s)?$/.exec(r.trim());
  if (m && r) return (Number(m[1] ?? 0) * 3600) + (Number(m[2] ?? 0) * 60) + Number(m[3] ?? 0);
  return NaN;
}

export class OpenAICompatProvider implements AiProvider {
  readonly name: string; readonly model: string;
  private baseUrl: string; private apiKey: string; private fetchImpl: FetchLike; private maxRetries: number;
  constructor(baseUrl: string, apiKey: string, model: string, policyName: string, fetchImpl: FetchLike = (u, i) => fetch(u, i), maxRetries = 1) {
    this.baseUrl = baseUrl; this.apiKey = apiKey; this.fetchImpl = fetchImpl; this.maxRetries = maxRetries;
    this.model = model.trim(); this.name = policyName;
  }

  async listModels(timeoutMs = 10000): Promise<string[] | null> {
    const ac = new AbortController(); const t = setTimeout(() => ac.abort(), timeoutMs);
    try {
      const res = await this.fetchImpl(`${this.baseUrl.replace(/\/$/, "")}/models`, { headers: { authorization: `Bearer ${this.apiKey}` }, signal: ac.signal });
      if (!res.ok) return null;
      const j: any = await res.json();
      return (j?.data ?? []).map((m: { id?: string }) => String(m.id ?? "")).filter(Boolean).slice(0, 60);
    } catch { return null; } finally { clearTimeout(t); }
  }

  async generateJson(req: { system: string; user: string; schema: Record<string, unknown>; timeoutMs?: number; temperature?: number; maxOutputTokens?: number }): Promise<AiResult> {
    const started = Date.now();
    let jsonMode = true;
    for (let attempt = 0; ; attempt++) {
      const ac = new AbortController(); const timer = setTimeout(() => ac.abort(), req.timeoutMs ?? 30000);
      let res: Response;
      try {
        res = await this.fetchImpl(`${this.baseUrl.replace(/\/$/, "")}/chat/completions`, {
          method: "POST", signal: ac.signal,
          headers: { "content-type": "application/json", authorization: `Bearer ${this.apiKey}`, "x-title": "Process & Policy Intelligence" },
          body: JSON.stringify({
            model: this.model, temperature: req.temperature ?? 0.3, ...(req.maxOutputTokens ? { max_tokens: req.maxOutputTokens } : {}),
            ...(jsonMode ? { response_format: { type: "json_object" } } : {}),
            messages: [{ role: "system", content: `${req.system}\n\nReply with ONE JSON object only, matching this JSON Schema:\n${JSON.stringify(req.schema)}` },
                       { role: "user", content: req.user }],
          }),
        });
      } catch (e) {
        clearTimeout(timer);
        const aborted = (e as Error)?.name === "AbortError";
        if (!aborted && attempt < this.maxRetries) { await sleep(600); continue; }
        return { ok: false, errorClass: aborted ? "timeout" : "provider", message: aborted ? "The AI provider did not respond in time" : "Could not reach the AI provider", model: this.model, latencyMs: Date.now() - started };
      }
      clearTimeout(timer);
      if (res.ok) {
        let j: any; try { j = await res.json(); } catch { return { ok: false, errorClass: "invalid_response", status: res.status, message: "Provider returned non-JSON", model: this.model, latencyMs: Date.now() - started }; }
        if (j?.error) return { ok: false, errorClass: "provider", status: res.status, message: "AI provider error", model: this.model, latencyMs: Date.now() - started, detail: scrub(String(j.error?.message ?? "")).slice(0, 300) };
        const ch = j?.choices?.[0]; const text = String(ch?.message?.content ?? "");
        if (!text) return { ok: false, errorClass: ch?.finish_reason === "content_filter" ? "blocked" : "invalid_response", message: "Provider returned no text", model: this.model, latencyMs: Date.now() - started };
        return { ok: true, text: extractJson(text), model: String(j.model ?? this.model), latencyMs: Date.now() - started,
                 usage: { input: j.usage?.prompt_tokens, output: j.usage?.completion_tokens } };
      }
      const status = res.status; let msg = "";
      try { const e = await res.json(); msg = String(e?.error?.message ?? e?.message ?? e?.detail ?? ""); } catch { /* ignore */ }
      if (status === 400 && jsonMode && /response_format|json/i.test(msg)) { jsonMode = false; continue; }   // model without JSON mode
      const wait = retryAfterSeconds(res.headers);
      if ((status === 429 || status >= 500) && attempt < this.maxRetries && !(Number.isFinite(wait) && wait > 10)) { await sleep(Number.isFinite(wait) && wait > 0 ? wait * 1000 : 1000); continue; }
      const daily = status === 429 && /per ?day|daily|RPD|TPD/i.test(msg);
      const errorClass: AiErrorClass = status === 429 ? "rate_limit" : status === 401 || status === 403 ? "auth" : status === 404 || (status === 400 && /model/i.test(msg)) ? "config" : "provider";
      const message = errorClass === "auth" ? "The AI provider rejected the API key"
        : errorClass === "rate_limit" ? (daily ? "The AI's free daily limit has been used up; please continue tomorrow (your answers are saved)"
            : `The AI is busy (free-tier limit); please try again in ${Number.isFinite(wait) && wait > 0 ? `about ${Math.ceil(wait)} seconds` : "a minute"}`)
        : errorClass === "config" ? `Model "${this.model}" is not available for this API key` : `AI provider error (HTTP ${status})`;
      return { ok: false, errorClass, status, message, model: this.model, latencyMs: Date.now() - started, detail: scrub(msg).slice(0, 300) };
    }
  }
}
