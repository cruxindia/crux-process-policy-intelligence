// Provider-independent AI adapter. No SDK dependency: plain HTTPS calls per the providers' REST documentation,
// so the same code runs in Supabase Edge Functions (Deno) and in local Node tests with an injected fetch.
// Never logs prompts or outputs — only provider, model, status and error class.

export type AiErrorClass = "config" | "auth" | "rate_limit" | "timeout" | "provider" | "invalid_response" | "blocked";
export type AiSuccess = { ok: true; text: string; model: string; latencyMs: number; usage?: { input?: number; output?: number } };
export type AiFailure = { ok: false; errorClass: AiErrorClass; status?: number; message: string; model?: string; latencyMs?: number };
export type AiResult = AiSuccess | AiFailure;

export interface AiProvider {
  readonly name: string;          // policy key, e.g. gemini_paid / gemini_free / local_ollama
  readonly model: string;
  generateJson(req: { system: string; user: string; schema: Record<string, unknown>; timeoutMs?: number; temperature?: number }): Promise<AiResult>;
}

type FetchLike = (url: string, init: RequestInit) => Promise<Response>;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function withTimeout(fetchImpl: FetchLike, url: string, init: RequestInit, timeoutMs: number) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);
  try { return await fetchImpl(url, { ...init, signal: ac.signal }); } finally { clearTimeout(t); }
}

/** Google Gemini via the generateContent REST endpoint (stateless: requests are not stored as conversations). */
export class GeminiProvider implements AiProvider {
  readonly name: string;
  readonly model: string;
  private apiKey: string | undefined;
  private fetchImpl: FetchLike;
  private maxRetries: number;
  private baseUrl: string;
  constructor(apiKey: string | undefined, model: string | undefined, policyName = "gemini_paid",
              fetchImpl: FetchLike = (u, i) => fetch(u, i), maxRetries = 2, baseUrl = "https://generativelanguage.googleapis.com/v1beta") {
    this.apiKey = apiKey; this.fetchImpl = fetchImpl; this.maxRetries = maxRetries; this.baseUrl = baseUrl;
    this.model = (model || "gemini-2.5-flash").trim();
    this.name = policyName;
  }

  async generateJson(req: { system: string; user: string; schema: Record<string, unknown>; timeoutMs?: number; temperature?: number }): Promise<AiResult> {
    if (!this.apiKey) return { ok: false, errorClass: "config", message: "GEMINI_API_KEY is not configured on the server", model: this.model };
    const url = `${this.baseUrl}/models/${encodeURIComponent(this.model)}:generateContent`;
    const body = (withSchema: boolean) => JSON.stringify({
      systemInstruction: { parts: [{ text: req.system }] },
      contents: [{ role: "user", parts: [{ text: req.user }] }],
      generationConfig: {
        temperature: req.temperature ?? 0.3,
        responseMimeType: "application/json",
        ...(withSchema ? { responseJsonSchema: req.schema } : {}),
      },
    });
    const started = Date.now();
    let useSchema = true;
    for (let attempt = 0; ; attempt++) {
      let res: Response;
      try {
        res = await withTimeout(this.fetchImpl, url, {
          method: "POST",
          headers: { "content-type": "application/json", "x-goog-api-key": this.apiKey },
          body: body(useSchema),
        }, req.timeoutMs ?? 30000);
      } catch (e) {
        const aborted = (e as Error)?.name === "AbortError";
        if (attempt < this.maxRetries && !aborted) { await sleep(500 * 2 ** attempt); continue; }
        return { ok: false, errorClass: aborted ? "timeout" : "provider", message: aborted ? "The AI provider did not respond in time" : "Could not reach the AI provider", model: this.model, latencyMs: Date.now() - started };
      }
      if (res.ok) {
        let json: any;
        try { json = await res.json(); } catch { return { ok: false, errorClass: "invalid_response", status: res.status, message: "Provider returned non-JSON", model: this.model, latencyMs: Date.now() - started }; }
        const cand = json?.candidates?.[0];
        if (!cand) {
          const blocked = json?.promptFeedback?.blockReason;
          return { ok: false, errorClass: blocked ? "blocked" : "invalid_response", message: blocked ? `Provider blocked the request (${blocked})` : "Provider returned no candidate", model: this.model, latencyMs: Date.now() - started };
        }
        const text = (cand.content?.parts ?? []).map((p: { text?: string }) => p.text ?? "").join("");
        if (!text) return { ok: false, errorClass: cand.finishReason === "SAFETY" ? "blocked" : "invalid_response", message: `Provider returned no text (finish: ${cand.finishReason ?? "unknown"})`, model: this.model, latencyMs: Date.now() - started };
        return { ok: true, text, model: json.modelVersion ?? this.model, latencyMs: Date.now() - started,
                 usage: { input: json.usageMetadata?.promptTokenCount, output: json.usageMetadata?.candidatesTokenCount } };
      }
      const status = res.status;
      let msg = "";
      try { msg = (await res.json())?.error?.message ?? ""; } catch { /* ignore */ }
      // Some model versions reject responseJsonSchema; fall back once to JSON mode + our own validation.
      if (status === 400 && useSchema && /responseJsonSchema|response_json_schema|schema/i.test(msg)) { useSchema = false; continue; }
      if ((status === 429 || status >= 500) && attempt < this.maxRetries) {
        const ra = Number(res.headers.get("retry-after"));
        await sleep(Number.isFinite(ra) && ra > 0 ? Math.min(ra, 10) * 1000 : 800 * 2 ** attempt);
        continue;
      }
      const errorClass: AiErrorClass = status === 429 ? "rate_limit" : status === 401 || status === 403 ? "auth"
        : status === 400 && /API key/i.test(msg) ? "auth" : status === 404 ? "config" : "provider";
      const safe = errorClass === "auth" ? "The AI provider rejected the API key"
        : errorClass === "rate_limit" ? "The AI provider's rate limit was reached; please try again shortly"
        : errorClass === "config" ? `Model "${this.model}" was not found for this API key`
        : `AI provider error (HTTP ${status})`;
      return { ok: false, errorClass, status, message: safe, model: this.model, latencyMs: Date.now() - started };
    }
  }
}

/** Local inference through Ollama's /api/chat (format = JSON schema). */
export class OllamaProvider implements AiProvider {
  readonly name = "local_ollama";
  readonly model: string;
  private baseUrl: string | undefined;
  private fetchImpl: FetchLike;
  constructor(baseUrl: string | undefined, model: string | undefined, fetchImpl: FetchLike = (u, i) => fetch(u, i)) {
    this.baseUrl = baseUrl; this.fetchImpl = fetchImpl;
    this.model = (model || "llama3.1").trim();
  }
  async generateJson(req: { system: string; user: string; schema: Record<string, unknown>; timeoutMs?: number; temperature?: number }): Promise<AiResult> {
    if (!this.baseUrl) return { ok: false, errorClass: "config", message: "OLLAMA_BASE_URL is not configured on the server", model: this.model };
    const started = Date.now();
    try {
      const res = await withTimeout(this.fetchImpl, `${this.baseUrl.replace(/\/$/, "")}/api/chat`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ model: this.model, stream: false, format: req.schema, options: { temperature: req.temperature ?? 0.3 },
                               messages: [{ role: "system", content: req.system }, { role: "user", content: req.user }] }),
      }, req.timeoutMs ?? 60000);
      if (!res.ok) return { ok: false, errorClass: res.status === 404 ? "config" : "provider", status: res.status, message: `Ollama error (HTTP ${res.status})`, model: this.model, latencyMs: Date.now() - started };
      const json: any = await res.json();
      const text = json?.message?.content ?? "";
      if (!text) return { ok: false, errorClass: "invalid_response", message: "Ollama returned no content", model: this.model, latencyMs: Date.now() - started };
      return { ok: true, text, model: this.model, latencyMs: Date.now() - started, usage: { input: json.prompt_eval_count, output: json.eval_count } };
    } catch (e) {
      const aborted = (e as Error)?.name === "AbortError";
      return { ok: false, errorClass: aborted ? "timeout" : "provider", message: aborted ? "Ollama did not respond in time" : "Could not reach Ollama", model: this.model, latencyMs: Date.now() - started };
    }
  }
}

/** Build the configured provider from environment values (read by the caller; never sent to the browser). */
export function providerFromEnv(get: (k: string) => string | undefined, fetchImpl?: FetchLike): AiProvider {
  const which = (get("AI_PROVIDER") || "gemini").toLowerCase();
  if (which === "ollama") return new OllamaProvider(get("OLLAMA_BASE_URL"), get("OLLAMA_MODEL"), fetchImpl);
  return new GeminiProvider(get("GEMINI_API_KEY"), get("GEMINI_MODEL"), get("AI_PROVIDER_POLICY") || "gemini_paid", fetchImpl);
}
