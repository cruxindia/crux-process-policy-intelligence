# Test Results

## M2 — Company Operating Blueprint (blueprint §4), 13-Nov-2026

Synthetic tenant `E2E-SYNTH`, real Gemini (free tier, server key). The synthetic lead played the MD. No mocks.

| Suite | Result | What it proves |
|---|---|---|
| DB local (`scripts/test-db.sh`) | **375/375**, 24 files | test 24 (31 assertions): only managers start the leadership interview; 20 leadership questions, one campaign, re-invites add nothing; the leader gets exactly the 20 questions; an AI entry without sources and a CTQ with a target are impossible at table level; employees see only agreed statements, approved CTQs and questions addressed to them; reject needs a reason; edited wording keeps the AI original; publish refused until the core areas are agreed; open question → named leader → answer becomes a proposed entry; a target needs a reason, and its requester cannot approve it; a second person approves; the published snapshot carries the approved CTQ; versions cannot change; every member reads them |
| Unit (`node --test`, functions) | **63/63** | sources and provenance; prompt forbids targets and the schema has no target field; target detection; invented refs, uncited items, targets and duplicates dropped; CTQ names in plain words; the published blueprint becomes a board source and the board task then requires alignment and no invented targets |
| E2E live (`web/e2e/blueprint.cjs`) | **17/17** | leader invited from the Leadership tab; 20 answers given in the ordinary interview screen; AI consultant run in the background → cited proposals across the core areas, CTQs without targets, open questions; nobody named; confirm with edit, reject needs a reason; target sent for approval and self-approval refused; open question answered → goes to review; version published and readable; phone layout; no page errors |
| Regression `board-api.cjs` (board-ai v10) | **23/23** | agreement and improvement cases unchanged; both cases now cite the published blueprint (12–13 turns each) |
| Hosted | PPI-032 applied (version 20261113113627); prompt `blueprint.synthesis` v2 active (`c38476ef…`), v1 retired; blueprint-ai v2; board-ai v10 | verified by query |

Defects found by our own tests and fixed:
- **v1 synthesis:** compressed multi-fact answers into one statement per area, and returned CTQ names as identifiers. Fixed in prompt v2, plus name normalisation in code (D-083).
- **E2E:** two inputs shared the label "Reason". Fixed with distinct labels.
- **Test design:** the rerun check expected repeats of statements that already existed. It now checks proposed and agreed statements together.

## Consolidation — many people, ONE company process/document, 13-Nov-2026

Owner requirement: "multiple people … would be chatting, but only one document has to be made, considering inputs from all, validating". Synthetic tenant `E2E-SYNTH`, real Gemini (free tier, server key; the owner's keys were not used). No mocks.

| Suite | Result | What it proves |
|---|---|---|
| DB local (`scripts/test-db.sh`) | **344/344**, 23 files | test 23 (17 assertions): employees cannot link or write sources; suggestion picks the right company process (department boost); two people's descriptions → one item; linking marks "done today"; a description belongs to exactly one item (move/move back); status form also records a source; members see the contributor count but only the sources from conversations they can read; employees cannot unlink; max 25 processes per case |
| Unit (`node --test`) | **61/61** | per-person source labels; "Variations and open points" required when ≥2 people (lint, not overrulable); interviewee names redacted and linted; automatic comparison on the real synthetic data gives the true answer (leave check 1 & 3, address check 1 & 2, no step lost or duplicated); source codes in any bracket form rejected |
| E2E UI (`web/e2e/consolidation.cjs`) | **13/13** | "From interviews" list with suggestions; three people's descriptions linked to ONE new item; computed side-by-side shows who does which step; "Described by 3"; ONE draft case carries all three; remove a description |
| E2E live board (`RUN_BOARD=1`) | **17/17** | the board finishes; the document has "Variations and open points" with correct attributions; the computed comparison annex is appended; no interviewee names; no source codes in the text |
| Regression `board-api.cjs` (board-ai v9) | **23/23** | agreement and improvement cases unchanged |
| Regression `catalogue.cjs` | **17/17** | M1 unchanged |
| Hosted | PPI-031 applied (version 20261113102502); prompt `board.turn` v4 active (`671e107f…`) for CRUX and E2E-SYNTH; board-ai v9 | verified by query; security advisors: no new class of finding |

Defects found by our own live tests and fixed (D-080):
- **v6:** the "Variations" section was missing and the AI audit passed it.
- **v6 again:** once the section was added, it misattributed steps between people and turned one person's WhatsApp hand-off into "secure channels".
- **v7:** a side-by-side list did not fix the attributions.
- **v8:** who-said-what is now **computed**. It is the authoritative source for the board, it is appended as an annex, and the item page shows the same table.
- **v8 → v9:** `[source: S13]` slipped past the reference-code lint; the lint is now widened.
- **Web:** an item-page crash (names used before they were loaded) was caught by the E2E run.

## M1 — Catalogue & classification (blueprint §5), 13-Nov-2026

| Suite | Result | What it proves |
|---|---|---|
| DB local (`scripts/test-db.sh`) | **327/327**, 22 files | test 22: baseline 148 items (idempotent), nothing pre-classified, members read / cannot write, reason required, Mandatory needs basis + reference, Mandatory waits for approval, one pending change per item, no self-approval, rejection needs a reason, owning department head updates status (not other departments), process gap vs documentation gap, company isolation |
| Hosted | PPI-030 applied; 148 items for CRUX and E2E-SYNTH; catalogue rights granted to company admins (manage + approve) and document approvers (approve) | verified by query |
| E2E (`web/e2e/catalogue.cjs`) | **17/17** | list + gap summary + filters; Required applies at once; "done today + no document" = Document missing; Mandatory refused without basis/reference, then sent for approval; self-approval refused with a clear reason; approvals tab; function → department mapping; "Draft it with the expert board" opens and links a case; history; phone layout 0 px sideways |

Defect found and fixed: self-approval was refused but shown as the generic "You do not have permission" — the app now shows the guard's own reason (D-078). The schema-security test caught default write grants on the new view (revoked).

## S-11 — Expert review board, 13-Nov-2026

All live tests used the synthetic tenant `E2E-SYNTH` and real Gemini (gemini-3.5-flash-lite, free tier, server key — the owner's 26 keys were not used). No mocks.

| Suite | Result | What it proves |
|---|---|---|
| Unit (`supabase/functions/tests/*.test.ts`, `web/lib/sop.test.ts`) | **53/53** | board plans, prompt rules, turn validation, sources without names, deterministic checks (codes, headings, title block, revision history, statutory numbers), content preservation, sticky spread (900 members over 9 slots, even and stable) |
| DB local (`scripts/test-db.sh`) | **303/303**, 21 files | test 21: charters immutable + hash-checked, cases only via RPC, append-only turns/outputs, employee cannot open cases, approver-only decision, rejection needs a reason, restricted data never allowed for training providers |
| Hosted bootstrap | 7 teams, **12/12 charters hash-verified**, prompt `board.turn` v3 active, 18 keyless slots, policy = confidential (CRUX + E2E) | verified by query after load |
| Live API (`web/e2e/board-api.cjs`, deployed `board-ai` v4) | **23/23** | NDA (confidential): 9 turns, 95 s, audited *pass*, 15k characters, title block + revision history, placeholders, no asserted section numbers, all protective clauses present; improvement review of a discovered process: 13 turns incl. one audit-driven revision round, 133 s, sources cited |
| Live UI (`web/e2e/board-ui.cjs`) | **14/14** (local production build against hosted Supabase; agreement re-run 12/12 incl. a revision round) | home link; case list; boardroom graph (experts, arrows); click-to-filter; document + audit verdict; reject without reason refused; approve recorded; teams page (6 teams, 12 versioned charters, no key material); phone layout without sideways scroll; no page errors |
| Discovery regression after redeploy (`discovery-api.cjs`, `discovery-ai` v7) | **14/14** | sticky routing + capped key unlocks did not change interview behaviour |

### Defects found by the live tests and fixed
| # | Defect | Fix |
|---|---|---|
| 1 | v1 NDA contained internal codes ([L1], legal_compliance), an invented "thirty (30) days", plain-text headings; standard clauses missing; the AI audit passed it | prompt v2 (Markdown, plain-word placeholders, `[proposed — confirm]` defaults, expected sections per document type) + deterministic checks the audit cannot overrule (D-068/D-069) |
| 2 | "Section 179 of the Companies Act" asserted without confirmation | statutory-number check (internal clause references allowed) |
| 3 | Document controller collapsed an agreement's 26 clauses into 9 policy sections (13.8k → 9.2k characters); audit passed it | prompt v3 (formatting never removes content; agreements keep contract structure) + content-preservation check with one retry, else the formatted version is discarded |
| 4 | Gemini occasionally hung > 50 s on a turn | output capped (12k tokens), one immediate retry on timeout, background resume |
| 5 | Title block lines ran into one paragraph | renderer keeps single line breaks; ordered lists keep their numbers |
| 6 | Phone: discussion column 723 px wide on a case with tables | grid `minmax(0, 1fr)` + wrapping (0 px sideways scroll) |
| 7 | Approve/Reject gave no feedback for 5–10 s | buttons show "Recording…" while the decision is saved |
| 8 | Test defects (not app): severability inside "Miscellaneous" counted as missing; decision checks latched onto an existing notice | checks accept bold clause labels; waits on the redirect |

### Not yet proven (honest gaps)
- The owner's real keys: routing to named slots, per-slot rate limits and "resting until" were unit-tested only.
- Many simultaneous cases (load) — not tested.
- Legal/tax/secretarial correctness of drafts — needs a qualified professional (PR-045).

## S-10 — AI-led discovery (Master Corrective Prompt v2.0), 12-Nov-2026

All live tests used the synthetic tenant `E2E-SYNTH` and real Gemini (gemini-3.5-flash-lite, free tier). No mocks.

| Suite | Result | What it proves |
|---|---|---|
| Unit (`supabase/functions/tests/*.test.ts`, `web/lib/sop.test.ts`) | **43/43** (also in CI: ai-engine, db-tests, web all green on `be64070`) | adapter, adaptive + discovery engines, routing/queue/Pacific reset, inventory nudge, name masking, draft SOP |
| DB local (`scripts/test-db.sh`, PG 16) | **287/287**, 20 files | incl. test 18: discovery RLS, append-only flow history, connections, Vault, limit, queue |
| DB hosted (Supabase PG 17, test 18, rolled back) | **21/21** | real Supabase Vault store/read; nothing left behind (checked) |
| Live API (`web/e2e/discovery-api.cjs`) | **14/14** (3 runs: v3, v5, v6) | opener; profile, 5–6 processes found automatically; forgotten item added; correction + "not sure" handled; inventory confirmed; map versioned (up to 9 versions); employee cannot write AI tables |
| Live UI (`web/e2e/discovery-flow.cjs`) | **19/19** | home "Let's understand the work you do" → Start; chips; "Can you explain?"; live React Flow map; activities + profile panel; resume after reload; Review Centre (profile, charter, library, SOP, clarifications); phone layout, no horizontal scroll |
| Live UI on **https://crux-ppi.netlify.app** after deploy of `be64070` | **19/19** | same suite against production; map actors show roles, not the employee's name |
| Existing member + manager view (`web/e2e/existing-member.cjs`) | **9/9** | member who joined earlier sees "Let's understand the work you do" on home; one click starts; no duplicates; admin lands on home; Discovery page per-person progress (17 rows), names open summaries, no sideways scroll |
| Reviewer promotion (`web/e2e/promote-process.cjs`) | **4/4** | discovered process → catalogue as candidate, linked and shown |
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
