# Project Gap Audit — Sprint 04 (AI-powered adaptive interview)

**Date:** 11 Nov 2026 · **Author:** Claude (AI), for Shantanu Suravase · **Repo state audited:** commit `fbf9ed3` (before Sprint 04 changes)
Legend: **Fact** = verified in code/DB · **Gap** = missing vs the Sprint 04 brief · **Assumption** = not verified

## 1. What the interview was before this sprint (facts)

| Area | State at `fbf9ed3` | Evidence |
|---|---|---|
| Question flow | Fixed list. `start_interview_session` copies every active template for the campaign's scopes (28 for CRUX: 8 profile, 8 company, 12 process) in a fixed order. No branching, no follow-ups. | `supabase/migrations/…142433_ppi_020…sql`, `crux_discovery_round1.sql` |
| AI calls | **None anywhere.** No code calls any model. | grep of repo: no `generativelanguage`, no Ollama call |
| AI scaffolding | Tables + guards existed but were unused: `ai_runs` (policy/classification/prompt guard trigger), `ai_provider_policies`, `prompt_versions`, `interview_questions.generated_by='ai'` + `ai_run_id` check. 0 rows on hosted. | PPI-00x migrations; hosted query |
| Secrets | `.env.example` listed `GEMINI_API_KEY` / `OLLAMA_BASE_URL`, but nothing read them and there was no server-side place to run AI code with a secret. | `.env.example` |
| Analysis / coverage / contradictions | Not stored. Progress % = answered ÷ total questions. Contradictions only detectable by a human reviewer. | `chat.tsx` |
| Reused as-is | Append-only answers with revision reason, drafts/resume, RLS by company/department/session, reviewer workspace, human clarification + dispute flows, audit log, mobile sign-up via join link. | tests 03, 05, 10–15 |

## 2. Gaps against the Sprint 04 brief and how each was closed

| # | Requirement (brief) | Gap found | Closed by | Status |
|---|---|---|---|---|
| A | Real AI integration, provider-independent; Gemini preferred; optional Ollama | No adapter, no runtime for secrets | `supabase/functions/_shared/ai-provider.ts` (Gemini REST `generateContent`, Ollama `/api/chat`, one interface); Edge Function `interview-ai` holds secrets | Implemented; **real Gemini calls blocked until the key is set** |
| B | Real connectivity check; never claim "connected" without a request | None | `status` action makes a real tiny request; admin button "Test AI connection" shows the provider's actual answer/error | Implemented + verified live (reports *Not connected: GEMINI_API_KEY is not configured on the server*) |
| C | Adaptive one-question-at-a-time engine over discovery dimensions | Fixed list only | `engine.ts`: 11 dimensions (6 critical), system prompt v1, full-context user message, next question chosen by the model, server-side completion rule | Implemented; mocked-tested; real-model behaviour **not yet observed** |
| D | Structured, validated output | — | JSON schema sent to Gemini (`responseJsonSchema`, fallback JSON mode) + independent validation (`validateTurn`): unknown refs/dimensions dropped, one corrective retry, repeat-question rejection | Implemented + unit-tested |
| E | Contradictions: keep both answers, ask neutrally, record | Not stored | `interview_clarifications` (immutable conflict fields, both answer IDs), clarification question linked, both answers stay append-only | Implemented + DB-tested |
| F | Memory across the interview / resume | Resume existed for fixed list | Whole transcript + profile + coverage + open clarifications sent each turn; state in DB; reload resumes at the pending AI question | Implemented; resume of AI question verified only in mocked/unconfigured run |
| G | Completion by coverage, not count | Count-based | `decideCompletion`: all critical dimensions sufficient + others touched + no open clarification + model agrees, or AI-question budget reached | Implemented + unit-tested |
| H | Separate raw answers from AI interpretation (knowledge layer) | n/a | `interview_answer_analyses`, `interview_dimension_coverage` (service-written, user-readable, append-only/guarded); raw answers untouched; nothing becomes "knowledge" without the existing human review | Implemented + DB-tested |
| I | UI: current question, analysing state, history, progress by dimension, clarification shown, correction, actual provider status, clear errors, no chain-of-thought | Chat existed | `chat.tsx` adaptive mode; "Why I'm asking" shows the model's one-line reason only | Implemented; verified in unconfigured state |
| J | Security: keys server-side, not in browser, not committed; logs without confidential content | No server runtime | Key only in Supabase Edge Function secrets; function logs metadata only; JWT verified; only the respondent can drive their interview; status check limited to admins/discovery leads; provider policy enforced in DB | Implemented + verified |

## 3. Remaining gaps (not closed in this sprint)

| Gap | Why open | Owner / next step |
|---|---|---|
| **No real Gemini call has been made** | `GEMINI_API_KEY` is not set in Supabase (verified by a live request). Claude may not enter API keys. | Shantanu: add the secret (AI_INTEGRATION.md §3), then Claude runs the live tests 1–5, 8 |
| Paid vs free tier unknown | Free tier = Google may use prompts to improve products + human review → D-011 allows **public data only**. Interview answers are internal. | Shantanu: confirm the key's Google Cloud project has billing enabled |
| Cross-border storage | Google's paid terms: prompts may be "stored transiently or cached in any country" (Gemini API Additional Terms, updated 28 Apr 2026). DPDP implications not assessed. | Shantanu / legal (PR-029) |
| Real-model quality | Question quality, contradiction detection rate and completion behaviour are model-dependent and unmeasured. | Live test + a small eval set after the key is set |
| Edit of an earlier answer while an AI question is pending | The edit is included (flagged `edited`) in the next turn, not analysed on its own. | Acceptable for v1; revisit after pilot |
| Ollama from Supabase cloud | Edge Functions cannot reach a server on CRUX's LAN without a public tunnel. | Only if a reachable Ollama host is provided |
| Reviewer view of AI analyses | Analyses are stored and readable by reviewers via RLS, but the reviewer screen does not display them yet. | Next sprint (knowledge layer) |
| Out of scope per brief | Risk, document generation, legal, dashboards | Not started by design |
