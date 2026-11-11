# Test Results — Sprint 04 (adaptive AI interview)

**Date:** 11 Nov 2026 · Every line says whether the AI was **mocked**, **real-but-unconfigured** (deployed function, no key) or **real Gemini**.
**No real Gemini request has been made yet:** `GEMINI_API_KEY` is not set in Supabase (confirmed by the deployed function's own status check).

## Summary

| Suite | Where | AI | Result |
|---|---|---|---|
| Engine + provider unit tests (`supabase/functions/tests/engine.test.ts`) | Node 22, local | **Mocked** (injected fetch) | **19 / 19 pass** |
| Type check of the Edge Function (`deno check`) | Deno 2.9.6 | n/a | **pass** |
| Database (pgTAP, 16 files) | Local PG 16 | n/a | **237 / 237 pass** |
| Test 16 (adaptive storage) | Supabase PG 17 (hosted, rolled back, cleanup verified) | n/a | **12 / 12 pass** |
| Provider-policy guard on hosted DB | Supabase | n/a | `gemini_free` + internal data → refused (`PPI_AI_POLICY … max public`) |
| Adaptive E2E, unconfigured (`web/e2e/adaptive-flow.cjs`, `EXPECT=unconfigured`) | Local Next.js build → **deployed** Edge Function v5 → Supabase dev, synthetic tenant | **Real function, no key** | **10 / 10 pass** |
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
