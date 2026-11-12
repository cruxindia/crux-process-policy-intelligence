# Implementation Progress — Sprint 04 (S-08): adaptive AI interview

**Status (12-Nov-2026): Live.** Real Gemini (gemini-3.5-flash-lite, free tier) verified end-to-end 15/15; CRUX join link switched to the AI interview.

| Step | What | State | Evidence |
|---|---|---|---|
| 1 | Repository audit | Done | `PROJECT_GAP_AUDIT.md` |
| 2 | DB: PPI-022 (analyses, coverage, clarifications, campaign AI fields, RLS, guards) | Applied to Supabase (version `20261111154743`) | pgTAP 16: 12/12 local + hosted |
| 3 | Provider adapter (Gemini REST, Ollama) | Done | 19 mocked unit tests |
| 4 | Engine (dimensions, prompt v1, schema, validation, completion, progress) | Done | unit tests |
| 5 | Edge Function `interview-ai` (`status`, `turn`) | Deployed — version 5, `verify_jwt` on | live status + authz checks |
| 6 | Prompt provenance + provider policies + adaptive campaigns | Applied: both tenants have prompt v1 (hash `5d69f83d…`); E2E-SYNTH `gemini_paid` active + campaign `E2E-ADAPT-01` + separate join link; CRUX `gemini_paid` **disabled**, campaign `CRUX-DISC-02` **draft** | `supabase/bootstrap/adaptive_ai_setup.sql` |
| 7 | Web UI: adaptive chat, analysing state, reasons, coverage chips, clarification tag, honest errors + retry, admin "Test AI connection" | Built; verified locally against the deployed function | adaptive E2E 10/10 (unconfigured) |
| 8 | CI: `ai-engine` workflow (unit tests, prompt-hash check, `deno check`) | Added | `.github/workflows/ai-engine.yml` |
| 9 | Docs: gap audit, AI integration, env example, test results, registers | Done | this folder + `docs/pack/00_GOVERNANCE` |
| 10 | Tier decided: **free** + owner acceptance recorded (PPI-023, D-045); employee notice; quota-aware errors | Done 12-Nov | test 17, E2E 11/11 |
| 10b | `GEMINI_API_KEY` set in Supabase secrets | Done by Shantanu 12-Nov | status Connected |
| 11 | Live tests with real Gemini on the synthetic tenant | Done — 15/15 after 2 fixes (clarification loop, network retry) | TEST_RESULTS.md |
| 12 | Switch CRUX link to the AI interview | **Done 12-Nov** (audited, reversible with "Switch back to fixed questions") | DB check |

## What CRUX employees see today

The CRUX join link opens: 8 questions about the person → 8 about the company → the AI interviewer (up to 25 questions about their work, one at a time). People who already finished the fixed interview keep their answers.

## Decisions taken in this sprint (details in the decision log)

- D-039 AI runs in a Supabase Edge Function; the key lives only in Edge Function secrets (not Netlify, not the browser).
- D-040 CRUX uses the `gemini_paid` policy, disabled until billing is confirmed; free tier stays public-only.
- D-041 Adaptive flow = 16 fixed opening questions (profile + company), then AI questions about the person's work; budget 25 AI questions for CRUX.
- D-042 Completion is decided by the server's coverage rule; the model's recommendation alone is not enough.
- D-043 On provider failure the employee sees the real error and *Try again*; nothing is invented.
