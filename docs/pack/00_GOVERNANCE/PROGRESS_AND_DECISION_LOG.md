# Progress and Decision Log

**Last consolidated:** 2026-11-11  
**Current baseline version:** 1.3 (S-02 hosted dev database + GitHub)  
**Rule:** A status may be changed to Implemented, Tested or Accepted only when a file, working feature, test result or explicit human decision can be identified. Use only the Master §15 vocabulary: Not Started / Planned / In Progress / Drafted / Implemented / Tested / Accepted / Blocked / Deferred / Superseded.

## 1. Current overall status

**Phase 0 — Drafted (awaiting owner acceptance). Phases 1–2 database layer — Implemented and Tested locally. Application layer — Not Started.**
- S-00 (audit): no pre-existing repository/code for this platform (evidence: `REPOSITORY_AUDIT.md` §2, §11). Re-checked at S-01 start: linked computer still has no connected folders; GitHub list unchanged.
- S-01 (build): new repository `crux-process-policy-intelligence` created **locally** (git, not yet pushed — GitHub CLI token in the build workspace is invalid; owner must create the empty private repo). 12 migrations, synthetic seed, 8 pgTAP files. Clean install + suite: **131 assertions, 0 failures** on PostgreSQL 16.15 (`scripts/test-db.sh`). S-02 (hosting): repo pushed to private GitHub `cruxindia/crux-process-policy-intelligence`; GitHub Actions `db-tests` run #1 passed. Supabase dev project created in Mumbai and migrated (PPI-001…013); hosted schema fingerprint identical to tested schema; hosted pgTAP run (files 01, 02, 03, 07 — 66 assertions) passed on PostgreSQL 17.11 with full rollback.

## 2. Workstream status

| Workstream | Spec status | Impl. status | Evidence / next action |
|---|---|---|---|
| Phase 0 audit & scope baseline | Drafted | n/a | `REPOSITORY_AUDIT.md`, `REQUIREMENTS_TRACEABILITY_MATRIX.md`; owner acceptance pending; decisions C-01, C-02, C-10 |
| Repository / environment | — | Implemented | Private GitHub repo + CI passing; Supabase dev project `pahzxpileudulljgaciw` (ap-south-1, Free) migrated; `ledger-personal` paused by owner decision to free the slot (S-02) |
| Product vision and scope | Drafted | n/a | Validate with CRUX management; MVP baseline conflict C-01 |
| Architecture and free-first AI | Drafted (Proposed) | Not Started | Free Gemini tier unsuitable for confidential data (C-10, PR-017) |
| Data model/schema | Implemented | Tested (local) | 49 tables, 2 views; `docs/ENTITY_RELATIONSHIP_DIAGRAM.md`, `docs/DATABASE_SCHEMA_REFERENCE.md` (generated); C-04/C-05/C-06 applied |
| Roles/security | Implemented (DB) | Tested (local) | RLS 49/49 tables, 110 policies, scoped permissions, SoD guards; tests 01–02. Sign-in/invitations not built. Candidate roles only (AQ-005, AQ-006) |
| Department/process catalogue | Drafted (templates) | Not Started | Real department list and pilot process (AQ-002, AQ-003) |
| Company DNA/VOC/CTQ | Drafted | Deferred (proposed, C-02) | After MVP slice, if C-02 accepted |
| Interview/adaptive questions | Implemented (data layer) | Tested (local) | Append-only answers, revisions, resume, session machine (test 03). Question engine/branch evaluator/UI Not Started |
| Shared knowledge/provenance | Implemented (data layer) | Tested (local) | Provenance + human-only verification guards (test 04); evidence storage bucket not provisioned |
| Process maps | Implemented (structure + validation) | Tested (local) | Versions/steps/edges/`process_map_issues()` (test 06); renderer Not Started |
| Cross-department tasks/disputes | Implemented (data layer) | Tested (local) | Test 05; reminder scheduling Not Started; decision-owner authority still candidate (AQ-006) |
| Risk/legal | Drafted | Not Started | Post-MVP; methodology + qualified reviewer needed |
| Documents/approvals/versioning | Implemented (data layer) | Tested (local) | Hash-bound approvals, immutable publication, acknowledgement (tests 07–08); templates/drafting Not Started (AQ-011) |
| Dashboards/testing/deployment | Implemented (MVP view, test runner, CI file) | Tested (local); CI not yet run | `dashboard_process_status`, `docs/DASHBOARD_METRICS.md`, `.github/workflows/db-tests.yml`; backup (C-11) Not Started |

## 2A. Sprint record

| Sprint | Date | Objective | Output | Files created/changed | Tests run | Result |
|---|---|---|---|---|---|---|
| S-00 | 2026-11-11 | Phase 0 repository audit and requirements coverage | Audit, RTM, SOW, document index, change log; register updates | Created: `REPOSITORY_AUDIT.md`, `REQUIREMENTS_TRACEABILITY_MATRIX.md`, `STATEMENT_OF_WORK.md`, `DOCUMENT_INDEX.md`, `CHANGE_LOG.md`. Changed: this log, `RISK_AND_DEPENDENCY_REGISTER.md`, `ASSUMPTIONS_AND_OPEN_QUESTIONS.md` | No application tests (no code). Verification commands only: pack extraction, prompt `diff` (identical), repo/project listings, coverage-count reconciliation (42 docs) | Drafted; awaiting owner acceptance |
| S-01 | 2026-11-11 | Phases 1–2 database foundation + MVP domain schema with enforced governance invariants | Local repo; 12 migrations; seed; 8 pgTAP files; ERD; generated schema reference; dashboard metrics; CI workflow | `supabase/migrations/20261111100000…101100_ppi_001…012_*.sql`, `supabase/seed/01_synthetic_two_companies.sql`, `supabase/tests/0[1-8]_*.test.sql`, `supabase/tests/_harness/*`, `scripts/test-db.sh`, `scripts/gen-schema-ref.sql`, `docs/*.md`, `.github/workflows/db-tests.yml` | `scripts/test-db.sh` → 8/8 files PASS, 131 assertions, 0 failures (PG 16.15, pgTAP). Mutation check (2 safeguards removed) → suite FAILED as expected. Defects found by tests and fixed: respondent could add revisions after submission (policy tightened to `interview.review`) | Implemented + Tested (local); not accepted |
| S-02 | 2026-11-11 | Host the build: GitHub + Supabase dev | Private repo pushed; CI green; Supabase project created (Mumbai) and migrated; advisor fix PPI-013; migration files renamed to hosted versions | `supabase/migrations/*` (renamed + `…121618_ppi_013_split_process_write_policies.sql`), README, registers | Local: 131/131 after PPI-013. GitHub Actions db-tests #1: success (23 s). Supabase PG 17.11: schema fingerprints equal (columns 528, constraints 355, functions 62, indexes 219, policies 116 after 013, triggers 73, RLS 49/49, views 2); hosted pgTAP 66/66 (files 01,02,03,07) with rollback — 0 rows/0 extensions left. Advisors: security = 1 INFO (background_jobs has no policy — intentional, service-only); performance = WARN fixed by PPI-013, 86 INFO unused-index (empty DB) | Implemented + Tested; not accepted |

## 3. Current architecture proposals

- PostgreSQL as core relational database.
- Supabase as a possible initial managed DB/auth/storage option, subject to current limits and security review.
- Next.js/React/TypeScript as a candidate frontend stack, subject to repository audit.
- Ollama as a local inference option.
- Hosted AI APIs only through a provider adapter and only for approved data categories.
- One orchestrator with specialist task prompts rather than independent AI silos.
- Human verification/approval before official knowledge or documents are published.
- Modular monolith first, not premature microservices.

These are proposed engineering decisions, not confirmed company policy or deployed components.

## 4. Next highest-priority work

S-00 and S-01 done. Revised dependency order:

1. ~~GitHub repo + CI~~ and ~~Supabase dev project + PG 17 verification~~ — done in S-02.
2. **Run remaining hosted tests** (files 04, 05, 06, 08) on Supabase the same way (only 01/02/03/07 were run hosted; all 8 pass locally and in CI).
3. **Phase 2 completion:** Supabase Auth sign-in + invitation → membership activation; private storage bucket `evidence-private` with RLS mirroring `can_read_evidence`.
4. **App shell (ADR-002 decision first):** Next.js + TypeScript server-side app using the user's JWT (never service_role for user actions); first screens: admin org/roles, my interview (resume), process owner review.
5. **AI adapter v1:** one provider path (local Ollama) behind `ai_provider_policies`; extraction prompt v1 with JSON schema + source-ID validation; eval cases before use.
6. Owner decisions still open: C-01, C-02, C-10/D-011, AQ-001, AQ-003 (pilot — CRUX to choose).

## 5. Decision log

| ID | Date | Decision / question | Status | Owner / evidence |
|---|---|---|---|---|
| D-001 | 2026-11-11 | One logically shared company knowledge repository with permissions rather than isolated departmental knowledge silos | Proposed baseline | Requires CRUX confirmation |
| D-002 | 2026-11-11 | AI outputs remain drafts until reviewed/approved as appropriate | Required design principle | To be enforced in workflow and database |
| D-003 | 2026-11-11 | Provider-independent AI adapter; local Ollama option; hosted providers optional | Proposed baseline | Requires data/provider review |
| D-004 | 2026-11-11 | PostgreSQL is preferred core database; Supabase is a candidate host | Proposed baseline | Confirm current tier/security/region |
| D-005 | 2026-11-11 | MVP should prove an end-to-end vertical slice before expanding breadth | Accepted delivery principle | Pilot process to be selected |
| D-006 | 2026-11-11 | Legal research assistance must not be treated as legal advice or final compliance confirmation | Required guardrail | Qualified Indian legal review required |
| D-007 | 2026-11-11 | Keep existing pack file names; map Master §5 names in `DOCUMENT_INDEX.md` (C-08) | Applied (reversible) | Claude; README rule |
| D-008 | 2026-11-11 | Use Master §15 status vocabulary only (C-07) | Applied (reversible) | Claude |
| D-009 | 2026-11-11 | Adopt Master §13 13-step MVP as baseline (C-01) | Proposed | Needs Shantanu/CRUX approval |
| D-010 | 2026-11-11 | Build MVP slice before Phase 4 DNA/VOC/CTQ (C-02) | Proposed | Needs Shantanu/CRUX approval |
| D-011 | 2026-11-11 | Unpaid/free hosted AI tiers limited to synthetic/public data; real interview data only to local or approved no-training provider (C-10). Evidence: Gemini API terms, unpaid tier — content used to improve products, human review, "do not submit sensitive, confidential, or personal information" (fetched 2026-11-11) | Proposed | Needs Shantanu/CRUX approval |
| D-012 | 2026-11-11 | Model knowledge `claim_origin` separately from `lifecycle_status` (C-04) | Implemented (PPI-006) | Review at Phase 1 acceptance |
| D-013 | 2026-11-11 | Governance invariants enforced in PostgreSQL (RLS + triggers), not only in app code, so they hold for every client incl. service_role and AI workers | Implemented (PPI-001…011) | Claude; reversible only by migration; owner review |
| D-014 | 2026-11-11 | Human-only transitions (verify, approve, decide, publish, review) require a `human` membership AND a token not marked `actor_type=ai`; AI/service identities are refused even if over-permissioned | Implemented + Tested | Tests 03–07 |
| D-015 | 2026-11-11 | Document approvals bind to the SHA-256 of content at submission; any edit voids earlier approvals | Implemented + Tested | Test 08 |
| D-016 | 2026-11-11 | UUID primary keys + composite `(company_id, id)` tenant FKs on all tenant tables | Implemented + Tested | Test 02 |
| D-018 | 2026-11-11 | Pause `ledger-personal` to free a Free-plan slot; create PPI dev project in ap-south-1 (Mumbai) in org `cruxindia's Org` | Done | Shantanu (instruction 17:25 IST) |
| D-019 | 2026-11-11 | Repo `cruxindia/crux-process-policy-intelligence` private; migration file versions = Supabase history versions | Done | Shantanu (instruction) / Claude |
| D-017 | 2026-11-11 | Working defaults applied while owner decisions pending: MVP = Master §13 (D-009), DNA/VOC/CTQ deferred (D-010), provider data cap (D-011). All reversible | Applied (reversible) | Pending Shantanu/CRUX approval |

## 6. How to update this log

At the end of every sprint, Claude must update:
- sprint number/date;
- objective and output path;
- files created/changed;
- tests actually run and results;
- decisions made and who approved them;
- blockers/assumptions;
- workstream statuses;
- next recommended dependency.

Never mark a workstream complete because a prompt was written or a file was proposed. Use statuses: Not Started, Planned, In Progress, Drafted, Implemented, Tested, Accepted, Blocked, Deferred or Superseded.
