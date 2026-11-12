# Test Results

## S-10 — AI-led discovery (Master Corrective Prompt v2.0), 12-Nov-2026

All live tests used the synthetic tenant `E2E-SYNTH` and real Gemini (gemini-3.5-flash-lite, free tier). No mocks.

| Suite | Result | What it proves |
|---|---|---|
| Unit (`supabase/functions/tests/*.test.ts`, `web/lib/sop.test.ts`) | **43/43** | adapter, adaptive + discovery engines, routing/queue/Pacific reset, inventory nudge, name masking, draft SOP |
| DB local (`scripts/test-db.sh`, PG 16) | **271/271**, 18 files | incl. test 18: discovery RLS, append-only flow history, connections, Vault, limit, queue |
| DB hosted (Supabase PG 17, test 18, rolled back) | **21/21** | real Supabase Vault store/read; nothing left behind (checked) |
| Live API (`web/e2e/discovery-api.cjs`) | **14/14** (3 runs: v3, v5, v6) | opener; profile, 5–6 processes found automatically; forgotten item added; correction + "not sure" handled; inventory confirmed; map versioned (up to 9 versions); employee cannot write AI tables |
| Live UI (`web/e2e/discovery-flow.cjs`) | **19/19** | home "Let's understand the work you do" → Start; chips; "Can you explain?"; live React Flow map; activities + profile panel; resume after reload; Review Centre (profile, charter, library, SOP, clarifications); phone layout, no horizontal scroll |
| Admin (`web/e2e/admin-ai.cjs`) | **11/11** | "Connected and tested" only after a real request (568–877 ms); keyless connection = "Not configured"; assignment add/switch-off; no key material on page; employee gets 404 |

### Defects found by the live tests and fixed
| # | Defect | Fix |
|---|---|---|
| 1 | Gemini HTTP 400 on the first discovery schema; error text not logged | provider detail logged (sanitised); size bounds moved to the validator (prompt v2); any 400 falls back once to JSON mode **with the schema in the prompt** (D-052) |
| 2 | UI test: no activities and no map after 7 answers — the model waited for inventory confirmation | prompt v3 "inventory is built continuously" + one-time nudge (D-053) |
| 3 | Turn failed when an off-topic answer made the model re-ask twice | up to 3 attempts; a schema-valid output that only fails the repeat/nudge check is used instead of an error (D-053) |
| 4 | "Why I'm asking" leaked internal planning ("…to complete the person") | prompt v3 rule: reason addressed to the employee, never stages/fields |
| 5 | Employee's own name was sent to Gemini and used as an actor on maps | name masked before sending (`[known — not shared]`); unit test |
| 6 | Map unreadable for long flows; tag ran into question text; phone panel opened off-screen | readable zoom anchored at the trigger; block tag; scroll into view |

### Not yet proven live (honest gaps)
- Saved-work queue: unit-tested (cooldown, Pacific midnight, message never mentions quota) but a real rate-limit was not provoked.
- Auth-failed / model-unavailable labels and Ollama fallback: unit-tested only.
- Off-topic scripted answers still produce some re-asking in new words (PR-035); review the first real CRUX conversations.
- `interview-ai` (S-08 engine) was not redeployed with the updated shared adapter; it is no longer used by the CRUX link.

---

# Earlier: Sprint 04 (adaptive AI interview)

## ✅ Real Gemini — 12-Nov-2026 (key set by owner in Supabase secrets)

| Check | Result |
|---|---|
| Network from Supabase Edge (us-east-2) to Google, no key (`net-probe`) | 403 in ~100 ms → network fine |
| Model diagnostic (admin `diagnose` action, trivial prompt, no company data) | `gemini-flash-lite-latest` → **gemini-3.5-flash-lite, 1.0 s ✅** · `gemini-flash-latest` → timeout > 45 s ❌ · `gemini-2.5-flash` / `-lite` → 404 ❌ |
| Decision | Default model = `gemini-flash-lite-latest` (D-048) |
| Live E2E run 1 (`EXPECT=connected`, synthetic tenant, function v11) | 14/14 pass, **but defect found**: the AI asked the same clarification 4× and stored duplicate contradictions |
| Fix (function v12) | duplicate contradictions dropped; an asked clarification is never asked again (reviewer follows up); asked-but-unresolved no longer blocks completion; clarification asked later is linked to its record; 2 new unit tests |
| Live E2E run 2 | 13/15 — clarification asked **once** ✅; one request never reached the server (browser OPTIONS logged, no POST — client-side network drop); UI showed the honest error |
| Fix (web) | chat retries once automatically on a dropped connection |
| **Live E2E run 3 (final)** | **15/15 pass**: connected status (658 ms), opening questions, 7 adaptive AI questions with reasons, contradiction detected and asked once, follow-up built on the corrected answer, reload resume, edit, 8/11 topics covered, completion and submit |
| Observed quality point | when the synthetic persona gave off-topic answers, the AI re-asked "what does the team lead check" in 3 wordings (not caught by the 0.75 similarity rule). Real answers should avoid this; review the first real interviews (PR-035) |

Example real questions (run 3): *"What information or documents do you receive to start an address verification?"* · *"Just to be sure I understood correctly, do you submit the reports directly to the bank without any internal review, unlike what you mentioned earlier about branch manager approval?"* · *"What does your team lead check for when they review your report in the app?"*

## Summary

| Suite | Where | AI | Result |
|---|---|---|---|
| Engine + provider unit tests (`supabase/functions/tests/engine.test.ts`) | Node 22, local | **Mocked** (injected fetch) | **19 / 19 pass** |
| Type check of the Edge Function (`deno check`) | Deno 2.9.6 | n/a | **pass** |
| Database (pgTAP, 16 files) | Local PG 16 | n/a | **237 / 237 pass** |
| Database suite in GitHub CI (`db-tests`, clean install) | GitHub runner, PG 16 | n/a | **237 / 237 pass** (run 43065622882, commit `f63fb77`). Earlier red runs on 76b1b15 / 8b54180 / f768844 were the runner failing to reach Ubuntu package mirrors (0 test failures); workflow now falls back to pgTAP from GitHub |
| `ai-engine` CI (unit tests, prompt-hash check, `deno check`) | GitHub runner | Mocked | **pass** (commit `f768844`) |
| Test 16 (adaptive storage) | Supabase PG 17 (hosted, rolled back, cleanup verified) | n/a | **12 / 12 pass** |
| Provider-policy guard on hosted DB | Supabase | n/a | `gemini_free` + internal data → refused (`PPI_AI_POLICY … max public`) |
| Adaptive E2E, unconfigured (`web/e2e/adaptive-flow.cjs`, `EXPECT=unconfigured`) | Local Next.js build → **deployed** Edge Function v5 → Supabase dev, synthetic tenant | **Real function, no key** | **10 / 10 pass** |
| Same adaptive E2E on the **live site** https://crux-ppi.netlify.app (commit `f768844`, CORS from production origin) | Netlify → deployed Edge Function | **Real function, no key** | **10 / 10 pass** |
| Edge Function authorisation (`web/e2e/adaptive-authz.cjs`) | Deployed function | Real function, no key | **4 / 4 pass** |
| Regression: fixed-mode join & chat (`web/e2e/join-chat-flow.cjs`) | Local build → Supabase dev | none | **18 / 18 pass** |
| Web type check / lint / production build | Local | n/a | 0 errors / 0 problems / build OK |
| Adaptive E2E with real Gemini (`EXPECT=connected`) | — | **Real Gemini** | **NOT RUN — blocked on the key** |

## Sprint brief tests 1–8

| # | Brief test | Evidence so far | Status |
|---|---|---|---|
| 1 | Real AI call with Gemini | Status check reaches the deployed function and reports the real reason it cannot call Gemini | **Blocked — key not set** |
| 2 | Adaptive follow-up builds on previous answer | Prompt + context construction unit-tested (mocked); real behaviour unobserved | Mocked only |
| 3 | No repeated questions | `isRepeat` + corrective retry unit-tested (mocked) | Mocked only |
| 4 | Contradiction detected, both answers kept, clarification asked | Validation of contradiction refs (mocked); storage + immutability + both answers preserved (pgTAP 16, hosted) | DB real; detection mocked |
| 5 | Resume after reload continues the AI interview | Pending-question resume logic (function returns the unanswered question; verified live for the opening question) | Partly real |
| 6 | Provider failure is shown honestly, no fake question | Live: status *Not connected — GEMINI_API_KEY is not configured on the server*; employee sees that message + *Try again*; 0 AI questions created; 3 `ai_runs` rows `failed/config`, idempotency keys released | **Pass (real, unconfigured)** |
| 7 | Keys never reach the browser / repo | Key read only via `Deno.env` in the function; web bundle has no AI code; `.env.example` holds no values; `.env.local` git-ignored | **Pass (inspection)** |
| 8 | Completion by coverage | `decideCompletion` + `progressPercent` unit-tested; budget completion wired | Mocked only |

## Defects found during this sprint and fixed

1. **Every function call returned "Sign in again" (401).** Cause 1: a server-side Supabase client has no stored session, so `auth.getUser()` must be given the JWT. Cause 2: passing the caller's token as a lower-case `authorization` global header conflicted with the client's own header and Supabase Auth rejected it ("This endpoint requires a valid Bearer token"). Fixed (JWT passed explicitly, header `Authorization`, new-style `SUPABASE_PUBLISHABLE_KEYS` / `SUPABASE_SECRET_KEYS` with legacy fallback). Verified live.
2. **Completed interview would show "busy" after a reload** (idempotency key per answer). Replaced with a fingerprint of the whole answer set: completed state is recognised without a new AI call, and any edit triggers a fresh analysis.
3. **A crashed run would block the interview forever.** Stale `running` runs are released after 3 minutes.
4. **E2E false negative:** Next.js's route announcer also uses `role="alert"`; tests now target `data-testid="ai-error"`.
5. Missing full stop in the error sentence.

## How to run the live AI test after the key is set

```
cd web && npm run build && npx next start -p 3000 &
EXPECT=connected E2E_ADAPT_TOKEN=… E2E_PASSWORD=… node e2e/adaptive-flow.cjs
```
The script answers as a synthetic field-verification officer and deliberately contradicts itself (answer 1 vs answer 3) to test clarification. It records every AI question so they can be reviewed.
