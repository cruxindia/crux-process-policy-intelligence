# Progress and Decision Log

**Last consolidated:** 2026-11-11  
**Current baseline version:** 1.6 (S-05 admin, invitations, live configuration)  
**Rule:** A status may be changed to Implemented, Tested or Accepted only when a file, working feature, test result or explicit human decision can be identified. Use only the Master §15 vocabulary: Not Started / Planned / In Progress / Drafted / Implemented / Tested / Accepted / Blocked / Deferred / Superseded.

## 1. Current overall status

**Phase 0 — Drafted (awaiting owner acceptance). Phases 1–2 database layer — Implemented and Tested (local, CI, Supabase). Application layer — first slice (sign-in, invitation acceptance, discovery setup, respondent interview, dashboard) Implemented and Tested end-to-end against Supabase dev; not deployed, not accepted.**
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
| Roles/security | Implemented (DB + app sign-in) | Tested (local, Supabase, E2E) | RLS 49/49 tables, scoped permissions, SoD guards; magic-link sign-in with no open sign-up (D-023); invitation acceptance UI. Access-token hook (PPI-016) written and tested but **not yet activated** in Supabase Auth (D-024). Candidate roles only (AQ-005, AQ-006) |
| Department/process catalogue | Drafted (templates) | Not Started | Real department list and pilot process (AQ-002, AQ-003) |
| Company DNA/VOC/CTQ | Drafted | Deferred (proposed, C-02) | After MVP slice, if C-02 accepted |
| Interview/adaptive questions | Implemented (data + UI, fixed question set) | Tested (local, Supabase, E2E) | Starter set of 26 generic questions (PPI-015); start/resume RPC; autosave drafts; append-only answers with revision reasons; "I don't know"/refer-to-owner/knowledge basis; submit; assignment guard (PPI-018). Adaptive branching, AI follow-ups and reviewer UI Not Started |
| Shared knowledge/provenance | Implemented (data layer) | Tested (local) | Provenance + human-only verification guards (test 04); evidence storage bucket not provisioned |
| Process maps | Implemented (structure + validation) | Tested (local) | Versions/steps/edges/`process_map_issues()` (test 06); renderer Not Started |
| Cross-department tasks/disputes | Implemented (data layer) | Tested (local) | Test 05; reminder scheduling Not Started; decision-owner authority still candidate (AQ-006) |
| Risk/legal | Drafted | Not Started | Post-MVP; methodology + qualified reviewer needed |
| Documents/approvals/versioning | Implemented (data layer) | Tested (local) | Hash-bound approvals, immutable publication, acknowledgement (tests 07–08); templates/drafting Not Started (AQ-011) |
| Dashboards/testing/deployment | Implemented (MVP view + page, test runner, CI ×2, E2E script) | Tested | `dashboard_process_status` shown on company home (dashboard.read); `db-tests` + `web` workflows; `web/e2e/interview-flow.cjs`. **Not deployed** — hosting decision open (D-026); backup (C-11) Not Started |

## 2A. Sprint record

| Sprint | Date | Objective | Output | Files created/changed | Tests run | Result |
|---|---|---|---|---|---|---|
| S-00 | 2026-11-11 | Phase 0 repository audit and requirements coverage | Audit, RTM, SOW, document index, change log; register updates | Created: `REPOSITORY_AUDIT.md`, `REQUIREMENTS_TRACEABILITY_MATRIX.md`, `STATEMENT_OF_WORK.md`, `DOCUMENT_INDEX.md`, `CHANGE_LOG.md`. Changed: this log, `RISK_AND_DEPENDENCY_REGISTER.md`, `ASSUMPTIONS_AND_OPEN_QUESTIONS.md` | No application tests (no code). Verification commands only: pack extraction, prompt `diff` (identical), repo/project listings, coverage-count reconciliation (42 docs) | Drafted; awaiting owner acceptance |
| S-01 | 2026-11-11 | Phases 1–2 database foundation + MVP domain schema with enforced governance invariants | Local repo; 12 migrations; seed; 8 pgTAP files; ERD; generated schema reference; dashboard metrics; CI workflow | `supabase/migrations/20261111100000…101100_ppi_001…012_*.sql`, `supabase/seed/01_synthetic_two_companies.sql`, `supabase/tests/0[1-8]_*.test.sql`, `supabase/tests/_harness/*`, `scripts/test-db.sh`, `scripts/gen-schema-ref.sql`, `docs/*.md`, `.github/workflows/db-tests.yml` | `scripts/test-db.sh` → 8/8 files PASS, 131 assertions, 0 failures (PG 16.15, pgTAP). Mutation check (2 safeguards removed) → suite FAILED as expected. Defects found by tests and fixed: respondent could add revisions after submission (policy tightened to `interview.review`) | Implemented + Tested (local); not accepted |
| S-02 | 2026-11-11 | Host the build: GitHub + Supabase dev | Private repo pushed; CI green; Supabase project created (Mumbai) and migrated; advisor fix PPI-013; migration files renamed to hosted versions | `supabase/migrations/*` (renamed + `…121618_ppi_013_split_process_write_policies.sql`), README, registers | Local: 131/131 after PPI-013. GitHub Actions db-tests #1: success (23 s). Supabase PG 17.11: schema fingerprints equal (columns 528, constraints 355, functions 62, indexes 219, policies 116 after 013, triggers 73, RLS 49/49, views 2); hosted pgTAP 66/66 (files 01,02,03,07) with rollback — 0 rows/0 extensions left. Advisors: security = 1 INFO (background_jobs has no policy — intentional, service-only); performance = WARN fixed by PPI-013, 86 INFO unused-index (empty DB) | Implemented + Tested; not accepted |
| S-03 | 2026-11-11 | Finish hosted verification; Phase 2 DB completion | Hosted run of files 04/05/06/08; PPI-014 invitation acceptance (`accept_membership` RPC, self/invited read policies) + private `evidence-private` bucket with storage.objects policies bound to `evidence_files`; test 09; local Storage stub | `supabase/migrations/20261111122325_ppi_014_invites_and_evidence_storage.sql`, `supabase/tests/09_invites_storage.test.sql`, `supabase/tests/_harness/00_supabase_stub.sql` | Hosted 04/05/06/08 = 65/65 → **all 8 original files pass on Supabase (131)**. Local 149/149 (9 files). Mutation check on PPI-014 (2 safeguards removed) → 2 failures as expected. Hosted 09 = 18/18 on real Supabase Storage; finding: Supabase Storage blocks direct SQL deletes on storage.objects (extra layer). Cleanup verified (0 rows/objects/users, pgTAP removed). Advisors: 1 INFO (background_jobs, intentional), 1 WARN accept_membership is SECURITY DEFINER callable by authenticated (intentional — D-020) | Implemented + Tested; not accepted |
| S-04 | 2026-11-11 | App shell + first end-to-end slice | Next.js 16 app in `web/` (Supabase SSR, user JWT only): magic-link sign-in, auth callback, sign-out, organisations + accept invitation, company home (my interviews + process status), discovery setup (load starter questions, create campaign, assign), respondent interview (start/resume, autosave, answer, revise with reason, submit). DB: PPI-015 app RPCs, PPI-016 access-token hook, PPI-017 respondent campaign read, PPI-018 assignment guard | `web/**`, `supabase/migrations/…123225_ppi_015…`, `…123538_ppi_016…`, `…123705_ppi_017…`, `…123921_ppi_018…`, `supabase/tests/1[0-2]_*.test.sql`, stub role `supabase_auth_admin`, `.github/workflows/web.yml` | Local pgTAP 177/177 (12 files). Mutation checks: ownership check in `start_interview_session` and scope rule in assignment guard removed → suite failed as expected. Supabase PG 17: files 10–12 = 28/28, cleanup verified. Web: `tsc` 0 errors, ESLint 0, `next build` OK (also with placeholder env as in CI). **E2E on Supabase dev (Playwright, two synthetic users): 17/18 checks passed first run; the 1 failure was a wrong assertion string in the test (screenshot + DB confirm the assignment existed) — assertion corrected.** DB cross-check: revision 2 supersedes revision 1 with reason, drafts cleared, session submitted, assignment completed, 24 audit events. Defects found and fixed: respondent could edit own assignment scope/status (PPI-018); `INSERT…RETURNING` blocked by session read policy (RPC fixed); respondents could not read their campaign name (PPI-017) | Implemented + Tested; not deployed; not accepted |
| S-05 | 2026-11-11 | Make it usable by real people and go live | Supabase Auth: access-token hook enabled, public sign-ups disabled (both verified after reload / with real tokens). PPI-019 invitations with one-time temporary passwords + DB-enforced password change. Web: password sign-in, set-password page, Administration (departments, processes, members, invitations, role grant/revoke). Real CRUX tenant bootstrapped. Netlify config | `supabase/migrations/…132248_ppi_019_invitations.sql`, `supabase/tests/13_invitations.test.sql`, stub `auth.users/identities` columns, `supabase/bootstrap/crux_tenant.sql`, `web/app/account/**`, `web/app/c/[companyId]/admin/**`, `web/app/login/**`, `web/lib/env.ts`, `web/e2e/admin-flow.cjs`, `netlify.toml` | Local pgTAP 193/193 (13 files). Mutation: removing the password-change rule → suite fails. Supabase: test 13 = 16/16 (rolled back, verified). Admin E2E on Supabase via real Supabase Auth: 14/14 (incl. token has `actor_type=user`, public sign-up refused, temp password works once then not at all, newcomer forced to set password, cannot open admin). Two first-run failures were test timing bugs (URL already contained previous success message), fixed in the test. Bootstrap validated locally, then applied; hosted counts equal (7 roles, 66 role permissions, 26 questions). **Finding:** Supabase org over free quota (other project 551 MB / 0.5 GB) — restriction risk for all projects (PR-027) | Implemented + Tested; **live** (see S-05b) |
| S-05b | 2026-11-11 | Deploy | Netlify project `crux-ppi` (Shantanu's team) deploying `main` of the private repo. First deploy served static files only (Netlify Next.js runtime not auto-applied for base dir `web/` → 404s); fixed by declaring `@netlify/plugin-nextjs` 5.16.4. Supabase Auth Site URL = `https://crux-ppi.netlify.app`, redirect allow-list `https://crux-ppi.netlify.app/**` (both verified after reload) | `netlify.toml`, `web/package.json`, `web/e2e/live-interview.cjs` | **Live: https://crux-ppi.netlify.app** — routes: `/` and protected pages 307→`/login`, `/login` 200, security headers present. Live E2E (synthetic tenant): admin/invitation flow 14/14, interview flow 4/4. Supabase security advisor: SECURITY DEFINER WARNs on accept_membership, invite_member, password_change_required, reissue_temporary_password (intentional; each checks permissions; tests 09/13); INFO no-policy on `private.pending_credentials` and `background_jobs` (intentional); WARN leaked-password protection off (follow-up, likely paid-plan feature) | Live; not accepted |

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
2. ~~Remaining hosted tests~~ and ~~Phase 2 DB completion (invitations, private evidence storage)~~ — done in S-03. Still open for Phase 2: Supabase Auth settings (email provider, redirect URLs, disable open sign-up) — configured with the app shell.
4. ~~App shell + interview slice~~ — done in S-04 (not deployed).
4a. ~~Hook activation, sign-up disabled, hosting choice~~ — done S-05. **Done:** deploy + Supabase URLs (S-05b). **Still open:** custom SMTP from a CRUX address (needs Shantanu's mail credentials); resolve org quota (PR-027).
4b. **Next app slice:** reviewer workspace (review submitted interviews → create knowledge records with sources; clarification tasks), admin screens (departments, members, invitations via a server-only invite route, role assignment).
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
| D-020 | 2026-11-11 | `public.accept_membership` stays SECURITY DEFINER and callable by signed-in users: it only flips the caller's own `invited` membership to `active` (advisor WARN accepted) | Implemented + Tested (test 09) | Claude; owner review |
| D-021 | 2026-11-11 | Evidence object path convention `<company_id>/<evidence_file_id>/<file>`; metadata row first, upload second; no update/delete of stored evidence | Implemented + Tested | Claude; owner review |
| D-022 | 2026-11-11 | Web app = Next.js 16.4.3 + React 19 + `@supabase/ssr` in `web/` of the same repo; every user action runs with the user's JWT via the publishable key; `service_role` is never used by the app. Versions pinned exactly, all ≥2 weeks old | Implemented | Claude; ADR-002 owner review |
| D-023 | 2026-11-11 | Sign-in by email magic link with `shouldCreateUser: false` (invitation-only); same response whether or not the address exists. Still needed in Supabase Auth: disable sign-ups, Site URL + redirect allow-list, custom SMTP (built-in email is rate-limited, dev only) | Implemented (app); config pending | Owner approval for Auth settings |
| D-024 | 2026-11-11 | Access-token hook `public.custom_access_token_hook` (PPI-016) sets `actor_type='user'` on every Supabase Auth token. **Enabled in Supabase Auth → Hooks on 2026-11-11 (S-05); verified: a real access token carries `actor_type=user`.** Correction to S-04 note: `private.is_human_actor` treats a token *without* the claim as a person (`coalesce(...,'user')`), so human-only actions were never blocked without the hook; the hook makes the claim explicit. Service/AI tokens must carry `actor_type` ≠ `user` to be refused | Implemented + Tested + Active | Claude, on Shantanu's delegation (18:43 IST) |
| D-025 | 2026-11-11 | Synthetic tenant `E2E-SYNTH` (2 users `@example.invalid`) kept on the **dev** project as an E2E fixture; it cannot be fully removed because audit events are append-only. Never created in production | Done | Claude; owner may veto |
| D-026 | 2026-11-11 | Hosting: nothing deployed. Vercel Hobby is non-commercial only (verified) → not for CRUX business use. Options: Vercel Pro, a CRUX-controlled server (`next start` behind HTTPS), Cloudflare (terms not yet verified) | Open | Shantanu/CRUX |
| D-027 | 2026-11-11 | Discovery question templates are company-wide; loading/creating them needs company-scoped `interview.manage` (department heads cannot) | Implemented + Tested (test 10) | Claude; owner review |
| D-028 | 2026-11-11 | Hosting = **Netlify free plan**: commercial use permitted per Netlify staff (2021, 2024, May 2025 forum answers — ToS itself still to be read); zero-config Next.js 16. Rejected: Vercel Hobby (non-commercial), GitHub Pages (repo would have to be public; terms bar commercial/SaaS use and password handling), Cloudflare (dashboard not reachable from the browser extension here). Account sign-in must be done by Shantanu (Claude may not create/sign in to accounts) | Done — live at https://crux-ppi.netlify.app (S-05b) | Claude, on Shantanu's delegation |
| D-029 | 2026-11-11 | Supabase built-in email only delivers to the Supabase org team (only Shantanu) at 2/hour (Supabase docs). So colleagues are onboarded by **one-time temporary password** shown once to the admin (PPI-019); the person must set their own password before the invitation can be accepted (DB-enforced); admins can re-issue only for accounts never secured. Email-link sign-in kept for when custom SMTP exists | Implemented + Tested (local, Supabase, E2E) | Claude, on Shantanu's delegation |
| D-030 | 2026-11-11 | Supabase project `pahzxpileudulljgaciw` now holds the **live CRUX tenant** (pilot) alongside the synthetic `E2E-SYNTH` tenant, isolated by tenant RLS. A separate production project is advisable before broad rollout | Applied | Claude, on Shantanu's delegation; revisit before rollout |
| D-031 | 2026-11-11 | Public Supabase URL + publishable key are defaults in `web/lib/env.ts` (public by design; RLS protects data) so the host needs no secrets; env vars still override | Implemented | Claude |
| D-032 | 2026-11-11 | CRUX tenant bootstrap (`supabase/bootstrap/crux_tenant.sql`): company, 7 **candidate** roles (AQ-005), 26 starter questions, first administrator Shantanu (Company administrator + Discovery lead). No departments/processes/people invented (AQ-002) | Applied on Supabase | Claude, on Shantanu's delegation |
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
