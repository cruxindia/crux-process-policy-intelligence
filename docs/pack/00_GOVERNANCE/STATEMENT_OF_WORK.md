# Statement of Work (living) — CRUX Process & Policy Intelligence Platform

**Document status:** Drafted · **Version:** 0.1 · **Last updated:** 2026-11-11
**Sponsor / requester:** Shantanu (AVP — Operations & Growth, Business Excellence & Culture)
**Executor:** Claude (AI assistant), working under MASTER_CLAUDE_BUILD_PROMPT and CRUX organisational operating instructions (SOW + verification + audit loop)

## 1. Objective / desired outcome
Build the CRUX Process & Policy Intelligence Platform as a secure, source-traceable, permission-controlled application (full mission: MASTER_CLAUDE_BUILD_PROMPT §1). **Current engagement step:** Phase 0 — audit actual project state, map requirements, record contradictions, update the progress log and recommend the next dependency-safe action. No application code in this step.

## 2. Scope and boundaries
- **In scope (this step):** read full pack; search for a repository; repository audit; document coverage matrix; requirements traceability; contradiction register; progress/risk/assumption updates; next-step recommendation.
- **Out of scope (this step):** application code, migrations, creating cloud resources or GitHub repositories, choosing the pilot process, any CRUX-specific facts not supplied.

## 3. Requirements and constraints
- Pack documents are the requirements baseline; conflicts reported, not silently resolved (Master §2).
- Never claim implementation/tests without evidence (Master §3J).
- Do not invent CRUX departments, people, authorities, targets or legal obligations (AQ rule).
- Free-first, but verify current quotas/terms (Master §3G).
- Org instruction: SOW first, verify each step, audit before final.

## 4. Inputs, files, data and sources
| Input | Status |
|---|---|
| `CRUX_Process_Policy_Intelligence_Project_Pack_v1.zip` (21 files) | Read in full |
| Attached `MASTER_CLAUDE_BUILD_PROMPT.md` | Verified identical to pack copy |
| GitHub account repositories (10) | Listed; 2 inspected |
| Supabase organisation projects (3) | Listed |
| Linked Windows computer | No folders connected; not searched |
| supabase.com/pricing; ai.google.dev Gemini API terms | Fetched 2026-11-11 |

## 5. Assumptions
- A-1: No other repository exists outside the searched locations (unverified for local disks).
- A-2: The pack v1.0 is the latest baseline.
- A-3: Shantanu is the working owner of the pack until CRUX names an approver.

## 6. Deliverables (this step)
| Deliverable | Path | Status |
|---|---|---|
| Repository audit + document coverage matrix + contradiction register | `00_GOVERNANCE/REPOSITORY_AUDIT.md` | Drafted |
| Requirements traceability matrix | `00_GOVERNANCE/REQUIREMENTS_TRACEABILITY_MATRIX.md` | Drafted |
| Document index | `00_GOVERNANCE/DOCUMENT_INDEX.md` | Drafted |
| Change log | `00_GOVERNANCE/CHANGE_LOG.md` | Drafted |
| Progress & decision log update | `00_GOVERNANCE/PROGRESS_AND_DECISION_LOG.md` | Updated |
| Risk register update (PR-016–019) | `00_GOVERNANCE/RISK_AND_DEPENDENCY_REGISTER.md` | Updated |
| Open questions update (AQ-018–021) | `00_GOVERNANCE/ASSUMPTIONS_AND_OPEN_QUESTIONS.md` | Updated |
| This SOW | `00_GOVERNANCE/STATEMENT_OF_WORK.md` | Drafted |

## 7. Methodology
Read all files → search every reachable code location → verify facts with commands → classify each required document → map every FR/NFR/MVP step/acceptance scenario → cross-compare documents for conflicts → verify volatile external facts (hosting/AI terms) → update registers → reconcile counts → audit this SOW against the request.

## 8. Decisions made and rationale
| ID | Decision | Rationale | Authority |
|---|---|---|---|
| S-01 | Do not rename existing pack files; map required names in DOCUMENT_INDEX | README instruction; avoids duplicates | Claude (reversible) |
| S-02 | Use Master §15 status vocabulary only | Resolves C-07 | Claude (reversible) |
| S-03 | Do not create a GitHub repo or Supabase project without owner yes | External change in CRUX org | Claude |

## 9. Open questions / dependencies
See ASSUMPTIONS_AND_OPEN_QUESTIONS (AQ-001–AQ-021) and REPOSITORY_AUDIT §8 items marked DECISION REQUIRED (C-01, C-02, C-10, C-11).

## 10. Risks and known limitations
- Local disks of the linked computer were not searched (no connected folder).
- Inactive Supabase project `final_schema` not inspected.
- External facts (Supabase limits, Gemini terms) are as of 2026-11-11 and can change.

## 11. Validation / acceptance criteria (this step)
- [x] Every pack file read (21/21).
- [x] Every reachable repository location searched and recorded with evidence.
- [x] 42 required documents classified; counts reconciled by script.
- [x] FR-01–19, NFRs, 13 MVP steps, 12 acceptance scenarios mapped.
- [x] Contradictions listed with source and proposed resolution.
- [x] Progress log updated with verified facts only; no implementation claimed.
- [ ] Owner acceptance of audit — pending Shantanu.

## 12. Current status and next actions
**Status:** Phase 0 audit Drafted. **Next:** owner yes to create private repo and commit pack (Phase 0 close-out) → decisions C-01/C-02/C-10 → Phase 1 ERD.

## 12A. Sprint S-01 (2026-11-11) — database foundation build
- **Objective:** start building in dependency order (Phase 1–2 + MVP domain schema) without waiting on reversible decisions.
- **Scope in:** local repo; migrations; RLS; governance triggers; synthetic seed; automated tests; ERD; schema reference; CI file; register updates.
- **Scope out:** UI/API, Supabase provisioning, GitHub push (CLI token invalid; owner must create repo), AI adapter, risk/legal, DNA/VOC/CTQ.
- **Acceptance (this sprint):** [x] clean install from zero; [x] RLS on all tables; [x] AC-01/02/03/04/05/06/07/08/10/11 tested at DB layer; [x] runner fails when safeguards removed (mutation check); [x] registers updated with evidence; [ ] pushed to GitHub; [ ] run on Supabase PG 17; [ ] owner acceptance.

## 12B. Sprint S-08 (Sprint 04 brief, 2026-11-11) — adaptive AI interview
- **Objective:** replace the fixed question list with a real AI interviewer that asks one question at a time, builds on answers, detects contradictions and completes by coverage.
- **Scope in:** gap audit; provider-independent adapter (Gemini preferred, Ollama optional); server-side engine; validated structured output; contradiction handling; resume; coverage-based completion; UI states; security; tests 1–8; required docs.
- **Scope out (per brief):** risk analysis, document generation, legal, dashboards.
- **Inputs:** Sprint 04 brief (attachment); pack D-011 (AI data policy); Gemini API docs/terms (fetched 11-Nov-2026).
- **Assumptions:** ~~paid tier~~ → owner chose the **free tier** on 12-Nov-2026 and accepted Google using the data (D-045).
- **Acceptance:** [x] audit; [x] adapter + engine + function deployed; [x] honest failure (test 6) live; [x] keys never in browser/repo (verified in build output); [x] DB tests; [ ] real Gemini call (test 1); [ ] live adaptive/contradiction/resume/completion (2–5, 8); [x] owner confirmed tier (free, D-045); [x] CRUX activation built as admin switch (D-046); [x] key set by owner; [x] real Gemini E2E 15/15; [x] switch turned on (D-049); [ ] owner acceptance.
- **Status:** Live (12-Nov-2026). Remaining: owner acceptance; review first real interviews (PR-035).

## 12C. Sprint S-10 (Master Corrective Prompt v2.0, 12-Nov-2026) — AI-led discovery
- **Objective:** "Employee talks, AI drives, system builds, employee corrects, management approves." One conversation discovers the person (14 profile fields), what they actually do, an automatic process inventory, and each process in depth (A–J) with a live interactive map; Gemini connection made reliable and multi-project; honest saved-work queue.
- **Inputs:** `4fc2832d-attachment.txt` (prompt v2.0, **truncated mid-Part 8**), `cfd6bdde-attachment.txt` (explanation). Parts 9+ not received — requested from Shantanu.
- **Scope in:** P1 discovery engine (PPI-024, `discovery-ai`); P2 chat + live React Flow map; P3 home "Let's understand the work you do" + Review Centre (profile, responsibility charter, process library + maps, draft SOPs, clarifications); P4 admin AI connections (≤10, Vault keys, routing, health, test); P5 queue + usage view; CRUX link switch.
- **Scope out / not done:** anything in Parts 9+; autonomous background queue worker (runs when the employee returns — PR-038); reviewer approval workflow for discovered processes into the governed catalogue (`linked_process_id` exists, UI not built); editing the map by drag-and-drop (corrections go through chat by design).
- **Assumptions:** "Process" granularity is decided by the AI and reviewed by humans; draft SOPs are a deterministic re-ordering of the map (no AI text) until a document workflow is approved.
- **Acceptance:** [x] PPI-024/025/026 applied + tests 18 (local 271/271; hosted 21/21 incl. real Vault); [x] unit tests 38 + SOP 4; [x] live API test 14/14; [x] live UI test 19/19 (desktop + phone); [x] admin connections E2E 11/11; [x] keys never reach the browser (column grants + service-only RPC; page scan); [x] "Connected" only after a real round-trip; [x] CRUX link on discovery (audited); [ ] queue exercised live (only unit-tested — needs a real rate-limit); [ ] owner acceptance.
- **Status:** Live on Supabase; web pushed to Netlify with this commit.

## 13. Decision / change log
| Date | Change | By |
|---|---|---|
| 2026-11-11 | SOW created; Phase 0 audit executed | Claude |
| 2026-11-11 | S-01 build executed; working defaults D-017 applied pending owner decisions | Claude |
| 2026-11-11 | S-08 adaptive AI interview: implemented, deployed, blocked on key; D-039…D-044 | Claude |
| 2026-11-12 | S-09 free tier: PPI-023, admin switch, notice; waiting on key | Claude |
| 2026-11-12 | Real Gemini live; CRUX link on AI interview | Claude |
| 2026-11-12 | S-10 AI-led discovery (prompt v2.0): engine, live map, Review Centre, AI connections, queue; CRUX link switched; D-051…D-058 | Claude |
