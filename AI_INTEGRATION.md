# AI Integration — adaptive interview engine

## 1. How it works

```
Browser (chat)  ──JWT──▶  Supabase Edge Function `interview-ai`  ──HTTPS + x-goog-api-key──▶  Gemini generateContent
                              │ verifies JWT, checks the caller is the respondent
                              │ reads the session (service identity, this session only)
                              │ inserts ai_runs  ◀── DB guard: provider policy, data class, active prompt version
                              │ validates JSON output, rejects repeats, retries once
                              ▼
            interview_answer_analyses · interview_dimension_coverage · interview_clarifications · interview_questions (generated_by='ai')
```

- **The browser never sees an AI key.** The key exists only in Supabase → Edge Functions → Secrets.
- **Netlify has no AI secret** and needs none.
- Gemini is called through the stateless `generateContent` endpoint (no Interactions API, which stores conversations).
- Each turn sends: company name, campaign purpose, the employee's department and own profile answers (designation, location, role type… — **no name, mobile or email**), the full transcript (answers clipped to 1,500 chars), current coverage and open clarifications.
- Function logs contain only provider, model, HTTP status, error class and timings — never questions or answers.

## 2. Files

| File | Purpose |
|---|---|
| `supabase/functions/_shared/ai-provider.ts` | Provider adapter: `GeminiProvider`, `OllamaProvider`, `providerFromEnv` |
| `supabase/functions/_shared/engine.ts` | Discovery dimensions, system prompt v1, output schema, validation, repeat check, coverage merge, completion rule, progress % |
| `supabase/functions/interview-ai/index.ts` | Edge Function: actions `status` and `turn` |
| `supabase/functions/tests/engine.test.ts` | 19 mocked unit tests (no network) |
| `supabase/migrations/20261111154743_ppi_022_adaptive_interview.sql` | Tables, RLS, guards for analyses / coverage / clarifications; campaign `interview_mode`, `ai_provider`, `max_ai_questions` |
| `supabase/bootstrap/adaptive_ai_setup.sql` | Prompt version hash, provider policies, adaptive campaigns (applied) |
| `supabase/bootstrap/adaptive_ai_activate_crux.sql` | Switch CRUX's join link to the AI interview (**not applied** — run after §3) |
| `scripts/prompt-hash.mts` | Prints the prompt hash that must match `prompt_versions` |
| `web/app/c/[companyId]/interviews/[assignmentId]/chat.tsx` | Adaptive chat UI |
| `web/app/c/[companyId]/discovery/ai-status.tsx` | "Test AI connection" (admins / discovery leads) |

## 3. Turning it on (Shantanu)

1. **Get a Gemini API key** from Google AI Studio for a Google Cloud project **with billing enabled** (paid tier). On the free tier Google may use prompts to improve products and humans may review them; our policy (D-011) then allows public data only, and the database will refuse interview data.
2. **Supabase Dashboard → project `pahzxpileudulljgaciw` → Edge Functions → Secrets → Add:**
   `GEMINI_API_KEY` = your key. Optional: `GEMINI_MODEL` (default `gemini-2.5-flash`).
   Do not put the key in Netlify, GitHub, chat or email.
3. Open **Discovery setup → Test AI connection**. It must say **Connected** with the model name.
4. Tell Claude. Claude then runs the live tests on the synthetic tenant and, if they pass and you confirm billing, applies `adaptive_ai_activate_crux.sql` so new sign-ups on the existing CRUX link get the AI interview. People already interviewed keep their answers.

If you only have a free-tier key: set `AI_PROVIDER_POLICY=gemini_free`. The connection test will pass, but interviews will stop with an honest error (the campaigns require `gemini_paid`, and the database refuses internal data for `gemini_free`) — this is the safeguard working, not a bug.

## 4. Configuration reference

| Secret (Edge Function) | Default | Notes |
|---|---|---|
| `GEMINI_API_KEY` | — | Required for Gemini |
| `GEMINI_MODEL` | `gemini-2.5-flash` | Any `generateContent` model your key can use |
| `AI_PROVIDER` | `gemini` | `gemini` or `ollama` |
| `AI_PROVIDER_POLICY` | `gemini_paid` | Must equal an **active** `ai_provider_policies.provider` and the campaign's `ai_provider` |
| `ALLOWED_ORIGINS` | `https://crux-ppi.netlify.app,http://localhost:3000` | CORS |
| `OLLAMA_BASE_URL`, `OLLAMA_MODEL` | —, `llama3.1` | Only useful if the Ollama server is reachable from the internet |

## 5. Safeguards (all enforced server-side)

| Safeguard | Where |
|---|---|
| Provider must have an active policy; data class ≤ policy max; a training provider is capped at public | `private.ai_run_guard` trigger (tests 04, 16) |
| Prompt text + schema must match the registered, active prompt version (sha256) | Edge Function before any call |
| Only the respondent can advance their interview; status check only for `org.manage` / `interview.manage` | Edge Function (verified live) |
| Model output validated; invalid refs dropped; repeat questions rejected; one corrective retry | `engine.ts` (unit tests) |
| AI cannot overwrite answers; contradictions keep both answer IDs and cannot be edited; analyses append-only | PPI-022 (test 16) |
| Employees cannot write analyses, coverage or clarifications | RLS (test 16) |
| Double-click / two tabs: one AI run per answer-set fingerprint; stale runs released after 3 min | `ai_runs` unique idempotency key |
| No fake output: if the provider fails, the employee sees the real error and *Try again*; no question is invented | Edge Function + UI (verified live) |

## 6. Prompt changes

Changing `SYSTEM_PROMPT` or `TURN_SCHEMA` changes the hash. The function will then refuse to run ("prompt version is not registered") until a new `prompt_versions` row (version 2) is inserted with the new hash and the old one retired. CI checks the hash in `adaptive_ai_setup.sql`.
