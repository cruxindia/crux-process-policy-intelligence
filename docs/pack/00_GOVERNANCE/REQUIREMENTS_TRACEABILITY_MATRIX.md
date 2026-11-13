# Requirements Traceability Matrix (RTM)

**Document status:** Drafted · **Version:** 0.2 · **Date:** 2026-11-11 · **Owner:** to be assigned
**Basis:** MASTER_PRD v1.0 (FR-01–FR-19, §5 NFRs), MASTER_CLAUDE_BUILD_PROMPT §13 (MVP) and §14 (critical acceptance scenarios).
**Evidence base:** repository `crux-process-policy-intelligence` (local, not yet pushed). Test evidence = `scripts/test-db.sh` clean install on PostgreSQL 16.15 + pgTAP: **8 files, 131 assertions, 0 failures** (2026-11-11). Mutation check: removing two safeguards made the suite fail (exit 1). **S-03:** all 9 files (149 assertions) pass on Supabase PG 17 as well. **S-02:** GitHub Actions run #1 green; Supabase dev (PG 17.11) migrated with identical schema fingerprint; hosted run of files 01/02/03/07 = 66/66 pass (AC-01, 04, 05, 06, 07, 08, 11 re-verified on the hosted engine).

Status vocabulary (Master §15). Two layers are tracked separately because the database layer enforces governance but no user-facing application exists yet:
- **DB** = schema, RLS, triggers, functions. **App** = UI/API/worker/AI adapter.
- "Tested" = local PG 16 + GitHub Actions; hosted Supabase PG 17 verified for files 01/02/03/07.

## 1. Functional requirements

| Req | Title | DB status | App status | Evidence (DB) | Gaps / next |
|---|---|---|---|---|---|
| FR-01 | Identity & organisation | Tested | Tested (E2E, Supabase) | PPI-002, PPI-014, PPI-016, PPI-019; tests 02, 09, 11, 13; `web/app/login`, `web/app/account`, `web/app/c/[companyId]/admin`; E2E S-04/S-05 | Legal entities/locations admin UI not built; custom SMTP pending (PR-024) |
| FR-02 | Roles, permissions, scope, delegation | Tested | Implemented (grant/revoke UI; E2E covers grant via invitation) | PPI-003; tests 01, 02, 13 | Role/permission editing UI and delegation UI not built; authority matrix is candidate (AQ-005) |
| FR-03 | Department discovery | Tested (question set) | Tested (E2E, dev) | PPI-015 starter set (12 department questions, generic); test 10; E2E S-04 | Structured department profile built from reviewed answers not built; wording not yet reviewed by CRUX |
| FR-04 | Company DNA, VOC, CTQ | Not Started | Not Started | — | Deferred after MVP (C-02, pending approval) |
| FR-05 | Interview campaigns & sessions | Tested | Tested (E2E, dev) | PPI-005, PPI-015, PPI-017, PPI-018; tests 03, 10, 12; `web/app/c/[companyId]/discovery`, `…/interviews/[assignmentId]`; E2E S-04 | Reviewer workspace (review/reopen) and reminders not built |
| FR-06 | Adaptive question engine | Implemented (data only) | Not Started (fixed question set only) | `question_templates.branch_rules`, `interview_questions.rationale/generated_by` | Branch-rule evaluator + AI follow-up generator not built |
| FR-07 | Process discovery | Tested | Not Started | PPI-007; test 06 | RACI table, metrics/SLA tables, exceptions table not yet separate entities |
| FR-08 | Policy discovery | Implemented (partial) | Not Started | `knowledge_records.record_type='policy_rule'`, `state_kind='policy'` | Dedicated policy entities + deviation analysis not built |
| FR-09 | Shared knowledge & provenance | Tested | Not Started | PPI-006, PPI-014; tests 04, 09 (private bucket on Supabase Storage) | Server-side SHA-256 check of uploaded bytes not built (app layer) |
| FR-10 | Clarification & disputes | Tested | Tested (E2E, live) | PPI-008, PPI-021; tests 05, 15; `web/app/c/[companyId]/{requests,disputes}`; E2E S-07 | Reminder/escalation scheduling and email/WhatsApp alerts not built |
| FR-11 | Process mapping | Tested (validation) | Not Started | `process_map_issues()`; test 06 | Renderer/editor not built; BPMN not claimed |
| FR-12 | Risk & control | Not Started | Not Started | — | Phase 9 |
| FR-13 | Legal applicability support | Not Started | Not Started | — | Phase 9; qualified-review gate (AC-09) pending |
| FR-14 | Documents & governance | Tested | Not Started | PPI-009; tests 07, 08 | Templates, drafting assistant, export not built |
| FR-15 | Notifications & reminders | Tested (in-app, idempotent) | Implemented (in-app list on home; E2E-checked for replies/disputes) | PPI-010, PPI-021; tests 05, 08, 15 | Email/WhatsApp (AQ-014) and scheduled reminders not built |
| FR-16 | Dashboards | Tested (MVP view) | Implemented (company home table; not E2E-asserted) | `dashboard_process_status`; test 08; docs/DASHBOARD_METRICS.md | Other metrics need definitions (AQ-015) |
| FR-17 | Search | Implemented (index only) | Not Started | GIN FTS index on knowledge | Search function/API not built |
| FR-18 | Continuous improvement | Implemented (partial) | Not Started | `document_change_requests`, `state_kind='to_be'` | Trials/before-after metrics not built |
| FR-19 | Audit & history | Tested | Not Started | PPI-004; tests 07, 08 | Export/evidence packs not built |

## 2. Non-functional requirements

| NFR | Requirement | Status | Evidence / gap |
|---|---|---|---|
| NFR-01 | Deny-by-default security | Tested (DB) | RLS on 49/49 tables; anon has no grants; test 01 |
| NFR-02 | Multi-tenant-safe model | Tested (DB) | Composite tenant FKs; test 02 |
| NFR-03 | Responsive UI | Implemented (partial) | CSS grid collapses below 640 px, tables scroll; light/dark; not yet tested on a phone |
| NFR-04 | Accessible forms/autosave | Implemented (autosave storage only) | `interview_answer_drafts` |
| NFR-05 | Reliable interview resume | Tested (DB) | test 03 |
| NFR-06 | Idempotent jobs & retries | Tested (DB) | `enqueue_job`/`claim_jobs` SKIP LOCKED; test 08 |
| NFR-07 | Export, backup, restore | Not Started | C-11 |
| NFR-08 | Retention/deletion | Not Started | AQ-012 |
| NFR-09 | Provider-independent AI | Implemented (policy guard only) | `ai_provider_policies`; adapter not built |
| NFR-10 | Observability | Implemented (partial) | `correlation_id` in audit; no app tracing |
| NFR-11 | Explainable outputs | Tested (DB) | Source links + provenance guards; test 04 |
| NFR-12 | Performance | Implemented (partial) | All 78 FKs indexed (PPI-012); RLS helpers wrapped in `select`; no load test |

## 3. MVP vertical slice (Master §13 — proposed baseline per C-01)

| # | MVP step | DB | App |
|---|---|---|---|
| 1 | Admin creates department, members, scoped roles | Tested | Not Started |
| 2 | Department head receives and completes interview | Tested | Not Started |
| 3 | Interview adapts and can resume | Tested (PPI-022, test 16) | Adaptive engine deployed; mocked + unconfigured-live tested; **real-model test pending key** |
| 4 | Process details and evidence stored | Tested | Not Started |
| 5 | AI extracts steps with exact source refs | Guards tested; extractor not built | Not Started |
| 6 | Process owner reviews/corrects facts | Tested | Not Started |
| 7 | Another department answers a clarification | Tested | Not Started |
| 8 | Disagreement recorded without overwrite | Tested | Not Started |
| 9 | Draft process map | Structure + validation tested | Renderer Not Started |
| 10 | Draft SOP with source/gap report | Sources required; gap report not built | Not Started |
| 11 | Reviewers/approvers complete route | Tested | Not Started |
| 12 | Published version immutable + acknowledged | Tested | Not Started |
| 13 | Dashboard: status, gaps, approvals | Tested (view) | Not Started |

## 4. Critical acceptance scenarios (Master §14)

| ID | Scenario | Status | Test |
|---|---|---|---|
| AC-01 | Employee answer unchanged after correction | Tested (DB) | 03 #6–#11 |
| AC-02 | AI claim links to actual, accessible source IDs | Tested (DB) | 04 |
| AC-03 | Unsupported inference marked; never verifiable | Tested (DB) | 04 |
| AC-04 | Dept A cannot read Dept B restricted material | Tested (DB) | 02 |
| AC-05 | Company A cannot read Company B data | Tested (DB) | 02 |
| AC-06 | AI cannot close dispute / approve / verify / publish | Tested (DB) | 03, 04, 05, 06, 07 |
| AC-07 | No publish before all required approvals | Tested (DB) | 07 |
| AC-08 | Published version cannot be overwritten | Tested (DB) | 07 |
| AC-09 | Legal applicability needs qualified review | Not Started | Phase 9 |
| AC-10 | Hosted AI receives no unapproved confidential data | Tested (DB guard + Edge Function) | 04, 16; `ai_runs` inserted (guarded) before any provider call; hosted refusal of gemini_free verified |
| AC-11 | Retries create no duplicates | Tested (DB) | 04, 05, 07, 08 |
| AC-12 | Backup restore demonstrated before production | Not Started | C-11 |

## Master Corrective Prompt v2.0 (12-Nov-2026; Parts 1–8 only — rest not received)
| Req | Title | Status | Evidence | Gaps |
|---|---|---|---|---|
| V2-P1 | Employee never creates campaigns/chooses templates; one "Start conversation" | Tested (E2E) | welcome page; home card; PPI-027 (existing members, test 19); discovery-flow.cjs, existing-member.cjs | — |
| V2-P2 | AI discovers person (14 fields) | Tested (live) | `discovery.ts` PROFILE_FIELDS; Review Centre profile | Fields not volunteered stay "not discussed" |
| V2-P3 | Actual work incl. informal/unowned/automatable | Implemented | RESP_KINDS; responsibility charter | Live coverage of all kinds not separately tested |
| V2-P4 | Automatic process inventory + "anything else?" confirmation | Tested (live) | discovery-api.cjs (6 processes, inventory confirmed, forgotten item added) | — |
| V2-P4b | Per-process A–J deep dive, completeness | Tested (live, partial) | coverage + completeness; server-capped | Full completion of all processes not reached in tests (budget) |
| V2-P4c | Intents: unsure / explain / forgot / changed / correct | Tested (live) | intents observed: adds_responsibility, corrects_earlier, unsure, asks_explanation | "That process has changed" not separately scripted |
| V2-P5 | Gemini diagnostic statuses; never "Connected" on key presence | Tested (E2E) | admin-ai.cjs (Not configured / Connected and tested) | Auth-failed / model-unavailable paths unit-tested only |
| V2-P6 | Up to 10 project connections, Vault keys, routing, fallback, no rotation | Tested (DB 18 hosted + unit + E2E) | PPI-025; routing.test.ts; admin-ai.cjs | Ollama fallback not exercised live |
| V2-P7 | Queue, honest employee message, Pacific reset, admin usage | Implemented (unit-tested) | routing.test.ts; ai_jobs; admin usage/queue tables | Not exercised live (PR-038) |
| V2-P8 | Live interactive process map (not image/Mermaid) | Tested (E2E) | React Flow nodes + zoom controls in chat and Review Centre | — |
| V2-RC | Review Centre: profile, charter, process library + maps, draft SOPs, clarifications; correct via chat | Tested (E2E) | `work/[sessionId]/page.tsx`; sop.test.ts; PPI-028 test 20; promote-process.cjs | — |
| S11-1 | Agents with detailed roles, responsibilities, functions and tasks | Tested (live) | `agent_charters.json` (12 roles, versioned); teams page; test 21 (charter immutable, hash must match) | — |
| S11-2 | Agents talk and brainstorm with each other | Tested (live) | board plan: proposal → critiques addressed to the lead → consolidation → format → audit → revision; board-api.cjs (9 and 13 turns) | Critiques are sequential, not free-form chat (by design: auditable) |
| S11-3 | Teams: audit, document format, legal & compliance, PM (LSS BB/PMP/agile), CS, CFA/CA | Implemented + live | 6 expert teams / 12 roles | AI roles, not certified people (PR-045) |
| S11-4 | No forgetting / hallucination / drift over years | Tested (unit + live) | charter + prompt fingerprints per turn; numbered sources; reference library; deterministic checks incl. content preservation; append-only history with versions (D-068, D-069) | Model alias may change behind `gemini-flash-lite-latest` (PR-036) |
| S11-5 | Correct practices and improvements suggested | Tested (live) | improvement_review case from the Review Centre (Lean Six Sigma lead + PMP/Agile/Compliance/CA/CFA/Audit) | Employee view of approved suggestions not built (D-071) |
| S11-6 | Agreements, policies etc. drafted | Tested (live) | "Draft a new document" (policy, SOP, agreement, board resolution, compliance checklist, charter); NDA live test with clause outcome check | Professional sign-off required (PR-045) |
| S11-7 | Interactive visual of teams talking | Tested (UI) | boardroom React Flow graph, live polling, active speaker pulse, click to filter | — |
| S11-8 | Optimum key utilisation for many users | Implemented (unit) | 18 slots, sticky spread test (900 members over 9 slots), fallback, cap of 3 unlocks | Not load-tested with real keys (owner to paste) |
| BP-5a | Functional catalogue mapped to actual departments (many-to-one) | Tested (DB + E2E) | PPI-030 `catalogue_functions`, `catalogue_save_function`; test 22; catalogue.cjs | — |
| BP-5b | Enterprise policy catalogue (23) + department SOP lists + core processes, configurable | Tested (DB + E2E) | `seed_blueprint_catalogue` (148 items), add-item form | Starting list only; evolves through validated inputs |
| BP-5c | Mandatory / Required / Recommended / Not applicable with reason, basis, approval where material | Tested (DB + E2E) | `catalogue_request_classification`, `catalogue_decide_classification`, maker-checker, history | Which classes need approval is configurable per company (no UI yet) |
| BP-5d | Missing document ≠ missing process | Tested (DB + E2E) | `catalogue_gaps.gap_type` (process gap vs documentation gap) | — |
| BP-5e | Document gap → draft | Tested (E2E) | "Draft it with the expert board" links the case back to the item | — |
| BP-5f | Many people → ONE company process/document (owner, 13-Nov): inputs from all contributors consolidated and validated; no per-person documents | Tested (DB + unit + E2E + live AI) | PPI-031 `catalogue_item_sources`, `catalogue_link_source`, `catalogue_match_suggestions`, `catalogue_source_counts`; "From interviews" tab; item "What people said"; board rule 13 + per-person source labels + Variations lint; test 23; `consolidation.cjs` | PR-047, PR-048 |

