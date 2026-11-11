# Repository Audit — Phase 0

**Document status:** Drafted (not accepted) — historical snapshot of S-00. Since S-01 a local repository exists; current state: PROGRESS_AND_DECISION_LOG.md
**Version:** 0.1
**Audit date:** 2026-11-11 (IST)
**Prepared by:** Claude (AI assistant) for Shantanu, AVP — Operations & Growth, Business Excellence & Culture
**Approver:** Not yet assigned
**Input:** `CRUX_Process_Policy_Intelligence_Project_Pack_v1.zip` (SHA-256 prefix `746d3fbadad486c8`), 21 files, 182,990 bytes

> Every statement below is labelled **FACT** (verified this session, with evidence), **FINDING** (Claude's analysis of verified facts), **ASSUMPTION** or **DECISION REQUIRED**. Nothing in this audit is approved CRUX policy.

---

## 1. Headline result

| # | Question | Answer |
|---|---|---|
| 1 | Does an application code repository for this platform exist? | **FACT: none was found.** See §2 for the places searched. |
| 2 | Is any feature implemented, migrated, tested or deployed? | **FACT: no.** No code, migrations, tests, CI or hosting for this platform exist in any location searched. |
| 3 | Current project state | **Planning baseline only (pack v1.0).** 21 planning documents, all Drafted/Proposed, none approved. |
| 4 | Biggest blockers to Phase 1 | No repository; no approved pilot department/process; no hosting slot decided (Supabase free org is at its 2-active-project cap); AI provider policy for real interview data not decided (free Gemini tier is unsuitable for confidential data — §6.2). |
| 5 | Recommended next action | Create a private repository and commit this pack + audit (Phase 0 close-out), then Phase 1 ERD. Details in §9. |

---

## 2. Repository inventory — what was searched

| Location searched | Method | Result | Evidence |
|---|---|---|---|
| Project pack zip | Extracted and read all 21 files in full | Planning documents only. No `.sql`, `package.json`, source code, config or hidden files. | `find` over extracted tree; every file read |
| Attached `MASTER_CLAUDE_BUILD_PROMPT.md` | `diff` against pack copy (line endings normalised) | **Identical** to `07_DELIVERY/MASTER_CLAUDE_BUILD_PROMPT.md` | `diff` exit 0 |
| GitHub — all repositories visible to the connected account (10) | Repository listing | No repository for this platform. Repos: `crux-bi-dashboard`, `ledger`, `internshipprogram`, `Daily_Productivity`, `Crux_Escalation_Portal`, `crux-escalation-matrix`, `lumen_billextractor`, `Field-Bill-Calculator`, `crux-console`, `crux-pendency-dashboard` | `list_repos` result, 2026-11-11 |
| `cruxindia/crux-console` | Shallow clone | Single `index.html`, last commit 2026-07-16. Not related. | `git log -1` = `5dd61ba` |
| `cruxindia/crux-bi-dashboard` | Shallow clone, structure only | Separate BI product (Supabase SQL migrations ×350, Edge Functions, static `web/index.html`, `docs/`). Not this platform. Useful as a **convention reference** only (see §4). | `git log -1` = `59dffe6` (2026-11-11) |
| Supabase — organisation `zrbfhljuqphxhupddusr` | Project listing | 3 projects: `cruxindia's Project` (ap-southeast-1, ACTIVE — hosts Crux BI + Lumen), `ledger-personal` (ap-south-1, ACTIVE), `final_schema` (ap-northeast-1, INACTIVE, created 2026-08-12). None is designated for this platform. `final_schema` was **not inspected** — purpose unknown. | `list_projects` result |
| Linked Windows computer (`desktop-akbc8u2`) | Device info | **No folders connected to this session**, so local disks were not searched. A local repo may exist outside what was visible. | `get_device_info`: `connectedFolders: []` |
| "Earlier conversation's starter schema" (referenced in DATA_MODEL_BLUEPRINT §6 and README) | Searched the pack | **Not supplied.** Nothing to review; it must not be reused without review if it surfaces. | — |

**Limitation:** if the code lives on your laptop or in another GitHub account, this audit has not seen it. Connect that folder or name the repo and the audit will be re-run against it.

---

## 3. Current stack

| Layer | Status | Evidence |
|---|---|---|
| Language / framework / package manager | **None selected in code.** Pack proposes Next.js + React + TypeScript + Tailwind (ADR-002, Proposed). | SYSTEM_ARCHITECTURE §3 |
| Database | None. PostgreSQL proposed (ADR-003). | — |
| Auth | None. Supabase Auth proposed if Supabase chosen (ADR-005). | — |
| Storage | None. Private object storage proposed (ADR-006). | — |
| AI | None. Provider adapter accepted as principle (ADR-007); Ollama / Gemini / Groq candidates. | — |
| Tests / CI | None. | — |
| Hosting / deployment | None. | — |

## 4. Working, partial, broken, duplicated components

- **Working:** none (no code).
- **Partial:** none in code. Planning documents are partially complete — see §7 coverage matrix.
- **Broken:** none.
- **Duplicated:** none in code. Within the pack, several required documents exist under different names (§7) — treat as satisfied/partial, do not duplicate.
- **Reusable conventions (FINDING):** `crux-bi-dashboard` already uses timestamped Supabase migrations (`YYYYMMDDHHMMSS_<prefix>_<nnn>_<name>.sql`), a `docs/` folder with SOW/AUDIT_REGISTER/TEST_REPORT, `.env.example` and a GitHub Actions workflow. Reusing that layout lowers learning cost for the same developer. Its static single-HTML front-end is **not** a fit for this platform's requirements (server-side authorisation, multi-role workflows, approval state machines).

## 5. Existing data model, migrations and tests

- **Data model:** logical only — DATA_MODEL_BLUEPRINT.md (≈90 entities across 9 domains). No physical schema.
- **Migrations:** none. Nothing run on any database.
- **Tests:** none. No test has been executed for this platform.

---

## 6. Security and environment observations

### 6.1 Supabase free-tier capacity (FACT, verified 2026-11-11 from supabase.com/pricing)
- Free plan: **limit of 2 active projects**, paused after **1 week of inactivity**, 500 MB DB, 1 GB file storage, **automatic backups not included, PITR not included**.
- The current organisation already has **2 active projects**. A new project for this platform requires one of: pausing an existing project, using a different Supabase account/organisation, or developing locally first.
- **FINDING:** the free plan cannot meet the pack's own pilot gate ("backup and restore tested", PR-011, TESTING §5) without an external backup routine (e.g. scheduled `pg_dump` to private storage) — and the 1-week pause rule conflicts with a pilot that has quiet weeks. This must be decided before pilot, not before development.
- Region: `ap-south-1` (Mumbai) is available to the organisation (used by `ledger-personal`). Region choice for employee data needs privacy review (AQ-009); this audit makes no legal claim.

### 6.2 Free Gemini API tier vs confidential interview data (FACT, verified 2026-11-11 from ai.google.dev Gemini API Additional Terms, last updated 2026-04-28)
- For Unpaid Services Google "uses the content you submit … to provide, improve, and develop" its products; "human reviewers may read, annotate, and process your API input and output"; and the terms state **"Do not submit sensitive, confidential, or personal information to the Unpaid Services."**
- **FINDING — conflict:** MASTER_CLAUDE_BUILD_PROMPT §16 assumes use of "a free Gemini API". Employee interview answers, evidence and process detail are confidential by nature. Therefore the free Gemini tier is acceptable **only for synthetic or public test data**. Real interviews need local Ollama, a paid tier with no-training terms, or another provider approved for that data class (AQ-007). This should be recorded as a data-handling rule, not left as an assumption. It should not reuse the free-Gemini pattern adopted for the separate Crux BI "Ask Crux" feature.

### 6.3 Other observations
- No secrets were found in the pack (planning documents only).
- Linked Windows machine has no connected folders; Ollama feasibility (AQ-008) is unverified — hardware not inspected.

---

## 7. Document coverage matrix (MASTER prompt §5 required set, 42 documents)

Legend: **Present** = file exists with substantive content · **Covered-as** = requirement satisfied by an existing file under a different name · **Partial** = some content exists elsewhere · **Not started** · **Created (this audit)**.

| Area | Required document | Coverage | Where / gap |
|---|---|---|---|
| Governance | PROJECT_CHARTER_AND_SCOPE | Present — Drafted | 00_GOVERNANCE |
| Governance | MASTER_PRD | Present — Drafted | 01_PRODUCT (prompt lists it under Governance; location difference only) |
| Governance | REPOSITORY_AUDIT | Created (this audit) | 00_GOVERNANCE |
| Governance | PROGRESS_AND_DECISION_LOG | Present — updated this audit | 00_GOVERNANCE |
| Governance | ASSUMPTIONS_AND_OPEN_QUESTIONS | Present — updated this audit | 00_GOVERNANCE |
| Governance | RISK_AND_DEPENDENCY_REGISTER | Present — updated this audit | 00_GOVERNANCE |
| Governance | CHANGE_LOG | Created (this audit) | 00_GOVERNANCE |
| Architecture | SYSTEM_ARCHITECTURE | Present — Proposed | 02_ARCHITECTURE |
| Architecture | ARCHITECTURE_DECISION_REGISTER | Present — Proposed | 02_ARCHITECTURE |
| Architecture | DATA_FLOW_DIAGRAMS | Partial | Logical diagram SYSTEM_ARCHITECTURE §2; AI flow AI_PROVIDER §7. No per-flow DFDs or trust boundaries |
| Architecture | THREAT_MODEL | Not started | Inputs exist in ROLES_PERMISSIONS_SECURITY §6–7 and RISK register |
| Architecture | INTEGRATION_CATALOGUE | Not started | Needs AQ-004/AQ-014 (identity, email) |
| Data & security | DATA_MODEL_BLUEPRINT | Present — Drafted | 03_DATA_AND_SECURITY |
| Data & security | ENTITY_RELATIONSHIP_DIAGRAM | Not started | **Phase 1 first artefact** |
| Data & security | DATABASE_SCHEMA_REFERENCE | Not started | After ERD |
| Data & security | MIGRATION_PLAN | Partial | DATA_MODEL_BLUEPRINT §6 (principles only) |
| Data & security | ROLES_PERMISSIONS_SECURITY | Present — Drafted | 03_DATA_AND_SECURITY |
| Data & security | DATA_CLASSIFICATION_AND_RETENTION | Not started | Blocked on AQ-007, AQ-012; §6.2 gives one concrete rule |
| Data & security | RLS_POLICY_MATRIX | Not started | Phase 2 |
| Functional | DEPARTMENT_CATALOGUE | Partial (template) | DEPARTMENT_AND_PROCESS_DISCOVERY_TEMPLATES §A; real list blocked on AQ-002 |
| Functional | PROCESS_CATALOGUE | Partial (template) | Templates §B; pilot blocked on AQ-003 |
| Functional | COMPANY_DNA_VOC_CTQ_FRAMEWORK | Partial | Templates §C–D; MODULE_SPEC Module 2 |
| Functional | INTERVIEW_ENGINE_SPEC | Partial | MODULE_SPEC Module 4; INTERVIEW_KNOWLEDGE_AND_PROVENANCE §1–3. Missing: field-state machine, branch-rule format, question-template schema |
| Functional | KNOWLEDGE_AND_EVIDENCE_SPEC | Partial | INTERVIEW_KNOWLEDGE_AND_PROVENANCE §4–9 |
| Functional | PROCESS_MAPPING_SPEC | Partial | MODULE_SPEC Module 8; PRD FR-11 |
| Functional | CLARIFICATION_DISPUTE_WORKFLOW | Partial | MODULE_SPEC Module 7; PRD FR-10 |
| Functional | RISK_CONTROL_COMPLIANCE_SPEC | Covered-as | `RISK_LEGAL_AND_COMPLIANCE_GUARDRAILS.md` |
| Functional | DOCUMENT_GOVERNANCE_SPEC | Covered-as | `DOCUMENT_APPROVAL_AND_CHANGE_GOVERNANCE.md` |
| Functional | DASHBOARD_AND_REPORTING_SPEC | Partial | MODULE_SPEC Module 12; PRD FR-16. **No metric definitions/formulas yet** (AQ-015) |
| AI & quality | AI_PROVIDER_STRATEGY | Covered-as | `AI_PROVIDER_AND_ORCHESTRATION_STRATEGY.md` §1–6 |
| AI & quality | AI_ORCHESTRATION_SPEC | Partial | Same file §7–10 |
| AI & quality | PROMPT_REGISTRY | Not started | Phase 5 |
| AI & quality | AI_EVALUATION_PLAN | Partial | AI_PROVIDER §11 (test-case list, metrics named; no thresholds/dataset) |
| AI & quality | AI_SAFETY_TEST_CASES | Not started | Phase 5 |
| Delivery | IMPLEMENTATION_ROADMAP | Covered-as | `IMPLEMENTATION_ROADMAP_AND_ACCEPTANCE.md` |
| Delivery | API_CONTRACTS | Not started | Blocked on stack decision |
| Delivery | TEST_STRATEGY | Partial | TESTING_DEPLOYMENT_AND_OPERATIONS §1–2 |
| Delivery | DEPLOYMENT_RUNBOOK | Partial | TESTING_DEPLOYMENT_AND_OPERATIONS §3–4 |
| Delivery | BACKUP_RESTORE_RUNBOOK | Partial | Same §5 (requirements only; see §6.1 finding) |
| Delivery | INCIDENT_RESPONSE_RUNBOOK | Partial | Same §7 |
| Delivery | USER_ACCEPTANCE_TESTS | Partial | Same §8 |
| Delivery | USER_GUIDES | Not started | Needs working application |

**Totals (42):** Present 9 · Covered-as 4 · Partial 17 · Not started 10 · Created this audit 2 (REPOSITORY_AUDIT, CHANGE_LOG). Additional governance files created outside the required list: `STATEMENT_OF_WORK.md`, `DOCUMENT_INDEX.md`, `REQUIREMENTS_TRACEABILITY_MATRIX.md` (required by PHASE_SPECIFIC prompt 0).

Requirement-level coverage (FR-01 to FR-19, NFRs, MVP steps, critical acceptance scenarios) is in `REQUIREMENTS_TRACEABILITY_MATRIX.md` — **all 0% implemented**.

---

## 8. Contradictions and gaps inside the pack

No code exists, so there are no code-vs-spec contradictions. These are **spec-vs-spec** conflicts. Each has a proposed resolution; none is applied to the source documents until accepted.

| ID | Conflict | Sources | Proposed resolution | Status |
|---|---|---|---|---|
| C-01 | **MVP definition differs in three places:** Charter §9 has 10 steps (no dispute, no acknowledgement, no resume); Roadmap §3 has 9 steps; Master §13 has 13 steps (adds resume, dispute without overwrite, acknowledgement). | Charter §9; Roadmap §3; Master §13 | Adopt Master §13 (superset, most recent) as the MVP baseline; mark Charter §9 and Roadmap §3 as summaries. | DECISION REQUIRED |
| C-02 | **Phase order vs MVP-first:** Master §12 and Daily-sprint order place Company DNA/VOC/CTQ (Phase 4) before the interview engine; Module Spec "build order", Roadmap §6 P0 list and Master §13 exclude DNA/VOC/CTQ from the MVP. | Master §12, §13; Module Spec; Roadmap §6; Daily sprint F→G | Build the MVP vertical slice (Phases 1–3, 5–8, 10-minimal, dashboard-minimal) **before** Phase 4. Keep Phase 4 numbering, move it after the slice. | DECISION REQUIRED |
| C-03 | **Phase count:** Master has Phases 0–12 (11 = dashboards/CI, 12 = hardening/pilot); Roadmap has 0–11 (11 merges both). | Master §12; Roadmap §2 | Use Master's 0–12 numbering; Roadmap Phase 11 = Master 11+12. | Proposed |
| C-04 | **Knowledge lifecycle mixes origin and status:** Blueprint §3 chain `ai_suggested → employee_submitted → under_review…` implies an employee statement is downstream of an AI suggestion; Master §3C lists data states that are really claim *types* (raw statement, evidence, AI extraction, hypothesis) alongside lifecycle states (verified, approved, superseded). | Blueprint §3; Master §3C; Interview/Provenance §4, §8 | Model two separate columns: `claim_origin` (employee_statement, document_extract, system_extract, external_reference, management_decision, ai_inference, unverified_hypothesis) and `lifecycle_status` (draft/submitted, under_review, verified, approved, disputed, rejected, superseded, retired), plus `state_kind` (as_is / to_be / policy). Required states configured per record type. | Proposed — to be applied in ERD |
| C-05 | **Interview lifecycle:** `invited` is listed as a session state, but invitations belong to the assignment; a session exists only once started. | Blueprint §3 vs §2.3 | `interview_assignments.status`: invited/accepted/declined/expired/completed; `interview_sessions.status`: in_progress/submitted/review_pending/reviewed/closed/reopened. | Proposed |
| C-06 | **Process lifecycle hard-codes `risk_review`** for every process, while Document Governance §5 says the route depends on type/impact. Process uses `approved → active`, documents use `approved → published`. | Blueprint §3; Doc Governance §5 | Review steps come from a configurable, versioned route; process status keeps `active`, document version keeps `published` — both documented in the state-machine spec. | Proposed |
| C-07 | **Status vocabulary:** Progress Log rule says "changed to **Complete**", which is not in the Master §15 vocabulary; workstream table uses free-text values ("Drafted in this pack", "Requirements drafted"); Progress Log §6 omits `Superseded`. | Progress Log §1, §2, §6; Master §15 | Use Master §15 vocabulary only. Applied in the updated Progress Log. | Applied (this audit) |
| C-08 | **Required document names differ from pack file names** (6 cases, see §7 "Covered-as"). README says do not rename. | Master §5; README | Keep existing names; map them in `DOCUMENT_INDEX.md`. Create new files only where content is genuinely missing. | Applied (this audit) |
| C-09 | **Reading lists incomplete:** README and Master §2 omit `ASSUMPTIONS_AND_OPEN_QUESTIONS`, `RISK_AND_DEPENDENCY_REGISTER`, `DEPARTMENT_AND_PROCESS_DISCOVERY_TEMPLATES` and `PHASE_SPECIFIC_CLAUDE_PROMPTS`. | README; Master §2 | Add them to `DOCUMENT_INDEX.md` (done); update README at next pack version. | Partly applied |
| C-10 | **Free Gemini API assumption vs data-confidentiality requirements** (see §6.2). | Master §16; AQ-007; PR-002; Gemini terms | Rule: free/unpaid hosted tiers = synthetic/public data only. Real interview data = local model or an approved no-training provider. | DECISION REQUIRED (owner sign-off) |
| C-11 | **Free Supabase plan vs backup/restore pilot gate** (see §6.1). | ADR-004; PR-011; Testing §5 | Develop locally / on free tier with synthetic data; pilot requires either a tested external backup routine on free tier or an approved paid plan. | DECISION REQUIRED before pilot |
| C-12 | **Starter schema referenced but absent** (Blueprint §6, README). | Blueprint §6 | Treat as non-existent; ERD is designed fresh from the Blueprint. | Recorded |
| C-13 | **Phase-0 artefact list differs:** PHASE_SPECIFIC prompt 0 requires `REQUIREMENTS_TRACEABILITY_MATRIX.md`; Master §5 doc set does not list it. | Phase prompts; Master §5 | Created; added to index. | Applied (this audit) |

---

## 9. Recommended next steps (dependency order)

**Single highest-priority next task — Phase 0 close-out: create the repository.**
Create a **private** GitHub repository (suggested `cruxindia/crux-process-policy-intelligence`), commit this pack exactly as updated (under `/docs/pack/` or at root, per README), and add `.gitignore`, `.env.example` (no values) and a README pointing to the pack. Why first: every later phase gate requires "inspect the actual repository"; without one, migrations, tests and the progress log have no evidence home. Reversible, ~15 minutes, no product decisions required. **Not done in this audit because creating a repository in your GitHub organisation is an external change that needs your yes.**

Proposed minimal repository setup (stack per ADR-002/003/004 — Proposed, not accepted):

```text
crux-process-policy-intelligence/
├─ docs/pack/                  ← this project pack (unchanged names)
├─ supabase/
│  ├─ migrations/              ← YYYYMMDDHHMMSS_ppi_<nnn>_<name>.sql (same convention as crux-bi-dashboard)
│  ├─ seed/                    ← SYNTHETIC TEST DATA only (2 companies, ≥3 departments)
│  └─ tests/                   ← pgTAP RLS / constraint tests
├─ app/                        ← Next.js + TypeScript (added in Phase 1 only after ADR-002 accepted)
├─ .github/workflows/ci.yml    ← migration-on-clean-DB + tests (Phase 1)
├─ .env.example
└─ README.md
```

Then, in order:
1. **Owner decisions (blocking Phase 1 scope, not the ERD):** C-01, C-02, C-10; AQ-001 (single company vs entities), AQ-003 (pilot department/process — must come from CRUX).
2. **Phase 1, sprint 1:** `ENTITY_RELATIONSHIP_DIAGRAM.md` for the MVP domains only (organisation/identity, interview, knowledge/provenance, process version/steps/edges, clarification/dispute, document version/approval, audit, ai_runs), applying C-04/C-05/C-06. Design-only; no SQL run.
3. **Phase 1, sprint 2:** first foundation migration (companies, departments, memberships, roles, audit_events) run against a **local** disposable Postgres, with tenant-safe composite FKs and a clean-install test.
4. **Hosting decision before Phase 2:** where the dev Supabase project lives (C-11, AQ-009).

---

## 10. Risks and assumptions introduced or confirmed by this audit

- **New risks** (added to RISK_AND_DEPENDENCY_REGISTER): PR-016 Supabase project-slot cap; PR-017 free-tier AI terms (training use/human review); PR-018 no repository / evidence home; PR-019 free plan lacks backups/PITR and auto-pauses.
- **New open questions** (added to ASSUMPTIONS_AND_OPEN_QUESTIONS): AQ-018 repository location/ownership; AQ-019 Supabase account/organisation for this platform; AQ-020 purpose of inactive `final_schema` project; AQ-021 MVP baseline and phase order (C-01/C-02).
- **Assumption:** the audit scope is limited to the places listed in §2.

## 11. Commands / evidence log

| Step | Command / tool | Result |
|---|---|---|
| Extract pack | `unzip` to isolated folder; `find -exec wc -c` | 21 files, 182,990 bytes |
| Prompt identity | `diff` attached prompt vs pack copy | Identical |
| Code search in pack | `find . -name '.*' -o -name '*.sql' -o -name 'package.json'` | No matches |
| GitHub inventory | `list_repos` (limit 200) | 10 repos, none for this platform |
| Candidate repos | `git clone --depth 1` crux-console, crux-bi-dashboard | Neither is this platform |
| Supabase inventory | `list_projects` | 3 projects (2 active, 1 inactive), none for this platform |
| Linked computer | `get_device_info` | No connected folders |
| Supabase limits | Fetched supabase.com/pricing.md | 2 active projects; 1-week pause; no backups/PITR on Free |
| Gemini free-tier terms | Fetched ai.google.dev Gemini API terms | Training use + human review on unpaid tier; "do not submit sensitive, confidential, or personal information" |
