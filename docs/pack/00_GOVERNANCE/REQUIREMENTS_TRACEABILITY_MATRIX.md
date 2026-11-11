# Requirements Traceability Matrix (RTM)

**Document status:** Drafted · **Version:** 0.2 · **Date:** 2026-11-11 · **Owner:** to be assigned
**Basis:** MASTER_PRD v1.0 (FR-01–FR-19, §5 NFRs), MASTER_CLAUDE_BUILD_PROMPT §13 (MVP) and §14 (critical acceptance scenarios).
**Evidence base:** repository `crux-process-policy-intelligence` (local, not yet pushed). Test evidence = `scripts/test-db.sh` clean install on PostgreSQL 16.15 + pgTAP: **8 files, 131 assertions, 0 failures** (2026-11-11). Mutation check: removing two safeguards made the suite fail (exit 1). **S-02:** GitHub Actions run #1 green; Supabase dev (PG 17.11) migrated with identical schema fingerprint; hosted run of files 01/02/03/07 = 66/66 pass (AC-01, 04, 05, 06, 07, 08, 11 re-verified on the hosted engine).

Status vocabulary (Master §15). Two layers are tracked separately because the database layer enforces governance but no user-facing application exists yet:
- **DB** = schema, RLS, triggers, functions. **App** = UI/API/worker/AI adapter.
- "Tested" = local PG 16 + GitHub Actions; hosted Supabase PG 17 verified for files 01/02/03/07.

## 1. Functional requirements

| Req | Title | DB status | App status | Evidence (DB) | Gaps / next |
|---|---|---|---|---|---|
| FR-01 | Identity & organisation | Tested | Not Started | PPI-002; test 02 | Invitations/sign-in flow (Supabase Auth) not built; entities/locations have no admin UI |
| FR-02 | Roles, permissions, scope, delegation | Tested | Not Started | PPI-003; tests 01, 02 | Delegation only by `role.manage` holders; authority matrix is candidate (AQ-005) |
| FR-03 | Department discovery | Drafted | Not Started | departments.mandate; templates exist | Department profile fields + interview templates not loaded |
| FR-04 | Company DNA, VOC, CTQ | Not Started | Not Started | — | Deferred after MVP (C-02, pending approval) |
| FR-05 | Interview campaigns & sessions | Tested | Not Started | PPI-005; test 03 | |
| FR-06 | Adaptive question engine | Implemented (data only) | Not Started | `question_templates.branch_rules`, `interview_questions.rationale/generated_by` | Branch-rule evaluator + AI follow-up generator not built |
| FR-07 | Process discovery | Tested | Not Started | PPI-007; test 06 | RACI table, metrics/SLA tables, exceptions table not yet separate entities |
| FR-08 | Policy discovery | Implemented (partial) | Not Started | `knowledge_records.record_type='policy_rule'`, `state_kind='policy'` | Dedicated policy entities + deviation analysis not built |
| FR-09 | Shared knowledge & provenance | Tested | Not Started | PPI-006; test 04 | Storage bucket policies for evidence files not written (no Supabase project) |
| FR-10 | Clarification & disputes | Tested | Not Started | PPI-008; test 05 | Reminder/escalation jobs not scheduled |
| FR-11 | Process mapping | Tested (validation) | Not Started | `process_map_issues()`; test 06 | Renderer/editor not built; BPMN not claimed |
| FR-12 | Risk & control | Not Started | Not Started | — | Phase 9 |
| FR-13 | Legal applicability support | Not Started | Not Started | — | Phase 9; qualified-review gate (AC-09) pending |
| FR-14 | Documents & governance | Tested | Not Started | PPI-009; tests 07, 08 | Templates, drafting assistant, export not built |
| FR-15 | Notifications & reminders | Tested (in-app, idempotent) | Not Started | PPI-010; tests 05, 08 | Email deferred (AQ-014); reminder scheduler not built |
| FR-16 | Dashboards | Tested (MVP view) | Not Started | `dashboard_process_status`; test 08; docs/DASHBOARD_METRICS.md | Other metrics need definitions (AQ-015) |
| FR-17 | Search | Implemented (index only) | Not Started | GIN FTS index on knowledge | Search function/API not built |
| FR-18 | Continuous improvement | Implemented (partial) | Not Started | `document_change_requests`, `state_kind='to_be'` | Trials/before-after metrics not built |
| FR-19 | Audit & history | Tested | Not Started | PPI-004; tests 07, 08 | Export/evidence packs not built |

## 2. Non-functional requirements

| NFR | Requirement | Status | Evidence / gap |
|---|---|---|---|
| NFR-01 | Deny-by-default security | Tested (DB) | RLS on 49/49 tables; anon has no grants; test 01 |
| NFR-02 | Multi-tenant-safe model | Tested (DB) | Composite tenant FKs; test 02 |
| NFR-03 | Responsive UI | Not Started | — |
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
| 3 | Interview adapts and can resume | Resume tested; adaptation data-only | Not Started |
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
| AC-10 | Hosted AI receives no unapproved confidential data | Tested (DB guard) | 04 — adapter must also enforce before sending |
| AC-11 | Retries create no duplicates | Tested (DB) | 04, 05, 07, 08 |
| AC-12 | Backup restore demonstrated before production | Not Started | C-11 |
