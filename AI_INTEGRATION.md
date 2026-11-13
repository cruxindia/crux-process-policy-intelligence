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
| `supabase/bootstrap/adaptive_ai_free_tier.sql` | Records the owner's free-tier acceptance; campaigns use `gemini_free` (applied) |
| `supabase/bootstrap/adaptive_ai_activate_crux.sql` | Superseded by the admin button (`set_join_interview_mode`, PPI-023) |
| `scripts/prompt-hash.mts` | Prints the prompt hash that must match `prompt_versions` |
| `web/app/c/[companyId]/interviews/[assignmentId]/chat.tsx` | Adaptive chat UI |
| `web/app/c/[companyId]/discovery/ai-status.tsx` | "Test AI connection" (admins / discovery leads) |

## 3. Turning it on (Shantanu) — free tier, decided 12-Nov-2026 (D-045)

You chose the **Gemini free tier** and accepted that Google may use the interview data. This is recorded in the database
(`ai_provider_policies.training_accepted_*`), employees see a notice in the interview, and confidential data stays blocked.

1. **Create a fresh key** in Google AI Studio (the key posted in chat on 12-Nov should be deleted there — anything pasted in a chat
   should be treated as exposed).
2. **Supabase Dashboard → project `pahzxpileudulljgaciw` → Edge Functions → Secrets → Add new secret:**
   name `GEMINI_API_KEY`, value = the key. Nothing else is required (defaults: model `gemini-flash-lite-latest`, policy `gemini_free`). **Done 12-Nov.**
   Never put the key in Netlify, GitHub, chat or email.
3. Open the app → **Discovery setup → Test AI connection**. It must show **Connected** and the model.
4. Press **Turn on AI interview** (same box) — **done for CRUX on 12-Nov by Claude on your instruction, after the live test passed**. New sign-ups on the existing join link now get the AI interview. Already-interviewed
   people keep their answers. **Switch back to fixed questions** undoes it. Both are audited.
5. Optional: tell Claude so it can run the synthetic live test (`EXPECT=connected`) and review the first real AI questions.

**Free-tier limits.** Google sets per-project limits (requests per minute / per day) and shows them at
<https://aistudio.google.com/rate-limit>. Each AI question is one request. When a limit is hit, the employee sees
"The AI is busy … try again in about N seconds" or "free daily limit used up; continue tomorrow" — answers are never lost.
If the team is large, stagger the link (e.g. one department per day) or move to the paid tier (`AI_PROVIDER_POLICY=gemini_paid`
plus activating the `gemini_paid` policy and campaign provider).

## 4. Configuration reference

| Secret (Edge Function) | Default | Notes |
|---|---|---|
| `GEMINI_API_KEY` | — | Required for Gemini |
| `GEMINI_MODEL` | `gemini-flash-lite-latest` | Any `generateContent` model your key can use. 12-Nov diagnostic: flash-lite (3.5) answers in ~1 s; `gemini-flash-latest` timed out (> 45 s); 2.5 models 404 |
| `AI_PROVIDER` | `gemini` | `gemini` or `ollama` |
| `AI_PROVIDER_POLICY` | `gemini_free` | Must equal an **active** `ai_provider_policies.provider` and the campaign's `ai_provider`. Free is assumed unless `gemini_paid` is declared |
| `ALLOWED_ORIGINS` | `https://crux-ppi.netlify.app,http://localhost:3000` | CORS |
| `OLLAMA_BASE_URL`, `OLLAMA_MODEL` | —, `llama3.1` | Only useful if the Ollama server is reachable from the internet |

## 5. Safeguards (all enforced server-side)

| Safeguard | Where |
|---|---|
| Provider must have an active policy; data class ≤ policy max; a training provider is capped at public unless the owner's acceptance is recorded, and never above internal | `private.ai_run_guard` + PPI-023 check (tests 04, 16, 17) |
| Prompt text + schema must match the registered, active prompt version (sha256) | Edge Function before any call |
| Only the respondent can advance their interview; status check only for `org.manage` / `interview.manage` | Edge Function (verified live) |
| Model output validated; invalid refs dropped; repeat questions rejected; one corrective retry | `engine.ts` (unit tests) |
| AI cannot overwrite answers; contradictions keep both answer IDs and cannot be edited; analyses append-only | PPI-022 (test 16) |
| Employees cannot write analyses, coverage or clarifications | RLS (test 16) |
| Double-click / two tabs: one AI run per answer-set fingerprint; stale runs released after 3 min | `ai_runs` unique idempotency key |
| No fake output: if the provider fails, the employee sees the real error and *Try again*; no question is invented | Edge Function + UI (verified live) |

## 6. Prompt changes

Changing `SYSTEM_PROMPT` or `TURN_SCHEMA` changes the hash. The function will then refuse to run ("prompt version is not registered") until a new `prompt_versions` row (version 2) is inserted with the new hash and the old one retired. CI checks the hash in `adaptive_ai_setup.sql`.

## 7. Diagnostics

- **Discovery setup → Test AI connection**: one real request with the configured model.
- `POST interview-ai {action:"diagnose", company_id}` (admins / discovery leads): tries several Gemini models with a trivial
  prompt and reports which answer and how fast. Use it if the connection test times out.
- `net-probe` function: checks the Edge runtime can reach Google **without** any key (temporary; safe to delete in the Dashboard).

## 8. AI-led discovery engine (`discovery-ai`, S-10)

```
Browser ──JWT──▶ discovery-ai ── turn ──▶ connections ranked (process > department > interview type > shared > server default)
                     │                       │ key read from Supabase Vault by the service role only
                     │                       ▼
                     │                 Gemini generateContent (schema enforced; on HTTP 400 → JSON mode with schema in prompt)
                     ▼
   discovery_profiles · discovered_processes (+ versioned discovered_process_flows) · interview_questions · interview_clarifications · ai_runs
                     │ nothing could run → ai_jobs (queued, run_after = provider reset) → employee: "Your answers are safely saved…"
```

- Stages: person (14 fields) → responsibilities → inventory (built continuously; "anything else?" confirmation) → per-process deep dive (10 dimensions A–J, completeness computed server-side) → wrap-up.
- Prompt: `interview.discovery` **v3**, hash `bab7cd42…` (`scripts/prompt-hash-v2.mts`; CI checks it against `supabase/bootstrap/discovery_setup.sql`). Changing the prompt or schema = new version row.
- Sent to Gemini: company name, campaign purpose, department, known/discovered profile **with the employee's own name masked**, inventory, focused map, transcript. Never: mobile, e-mail, keys.
- Map: the AI returns the whole current flow each turn; the server sanitises it (unique ids, valid edges, ≤40 nodes) and stores a new version only when it changes.
- Multiple projects: Admin → AI connections. Add a connection (one Google Cloud project each), paste its key once (stored in Vault, never shown again), press Test (real request; "Connected and tested" only on success), assign departments/processes/interview types. A rate-limited connection rests until the provider's reset — keys are never rotated to get around limits.
- Logs: event names, connection id, model, timings, error class and Google's error text for 4xx (no prompts, answers or keys).
- Queue gap: a saved step runs when the employee comes back (no background worker yet — PR-038).


## 9. Expert review board (`board-ai`, S-11, 13-Nov-2026)

**What it does.** A person opens a *case* — "Draft a new document" on the Expert board page (policy, SOP, agreement, board resolution, compliance checklist, charter) or "Ask the expert teams to improve this" on a discovered process in the Review Centre. The board then works in the background through a fixed plan: the lead expert drafts → the other disciplines critique (each addressed to the lead) → the lead consolidates → the document controller applies the house format → the independent quality auditor gives pass / revise / fail → at most one revision round → **a person approves or rejects**. Every turn and every document version is kept (append-only).

**Who leads.** Improvement review → Lean Six Sigma Master Black Belt · Agreement → Corporate Counsel · Policy and compliance checklist → Chief Compliance Officer · SOP → Technical Writer · Board resolution → Company Secretary · Charter → PMP Programme Manager.

**Why it does not drift or forget.** Roles live in `supabase/bootstrap/agent_charters.json` → `scripts/agent-charters-sql.mts` → `agent_board_setup.sql` (CI fails if they differ). A charter can never be edited in the database; a change is a new version. Before each turn the function re-checks the charter's SHA-256 and the prompt's registered fingerprint (`board.turn` v3, `d74e2038…`). Facts only come from numbered sources (the brief and the interview facts, no employee names); laws only from a 23-item reference library, without section numbers or rates unless marked "[to be confirmed]". Deterministic checks the AI audit cannot overrule: internal codes in text, headings, title block, revision history, items-to-complete list, unmarked statutory numbers, and content lost during formatting.

### 9.1 Where each of your keys goes (paste them yourself — Admin → AI connections)
Create **new** keys first (the ones posted in chat on 13-Nov are exposed — PR-044). Each slot below already exists with no key; click it, paste the key, and the page tests it with one real request.

| Your key | Slot name in the app | Used by |
|---|---|---|
| Process Agent 1 … 9 | Process Agent 1 … 9 | AI discovery interviews — each employee stays on one slot; the others are fallback |
| PDM Agent 1, 2 | PDM Agent 1, PDM Agent 2 | Process Excellence & PMO team (leads improvement reviews) |
| PDM Agent 3, 4 | PDM Agent 3, PDM Agent 4 | Legal & Compliance team (leads agreements and policies) |
| PDM Agent 5 | PDM Agent 5 | Company Secretarial |
| PDM Agent 6 | PDM Agent 6 | Finance, Tax & Investment |
| PDM Agent 7 | PDM Agent 7 | Document Standards & Control |
| PDM Agent 8 | PDM Agent 8 | Independent Audit & Assurance |
| **any one** PD Agent key | PD Agents (shared project) | Overflow for everything (all 9 PD keys share one Google project = one quota, so one key is enough) |

Until a slot has a key, its work uses the shared pool and then the server key, so nothing stops.

### 9.2 Data and terms (read before pasting keys)
- Gemini **free tier**: Google may use what is sent to improve its products and human reviewers may read it. Google's terms also say: *"Do not submit sensitive, confidential, or personal information to the Unpaid Services"* (Gemini API Additional Terms, updated 28-Apr-2026). CRUX's owner accepted sending confidential company data on 13-Nov (D-065, PR-043). Customer/KYC personal data (*restricted*) is always refused by the database.
- Google APIs Terms §2(d): *"You agree to, and will not attempt to circumvent, such limitations documented with each API."* Using many free projects for one app may be read as circumvention (PR-042). For company-wide use, the paid tier on one billed project is the documented way to get higher limits — and it also stops Google using the data for training.

### 9.3 Operating it
- A case takes about 1.5–6 minutes. Keep the case page open or come back later: it continues automatically. "Resting until …" means that team's keys reached their free limit.
- Load: one case ≈ 8–14 AI calls; one discovery answer ≈ 1 call.
- Diagnostics: `board_cases.last_error`, `ai_runs` (capability `board_turn`), Edge Function logs (`fn: board-ai`, events `turn_ok`, `lint_retry`, `preservation_retry`, `audit_overruled`, `timeout_retry`, `provider_error`). Logs never contain document text or keys.
