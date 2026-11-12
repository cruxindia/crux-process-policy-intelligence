# CRUX Process & Policy Intelligence Platform

Governed, source-traceable, permission-controlled company knowledge system for CRUX Risk Management Pvt. Ltd.
Requirements baseline: [`docs/pack/README_START_HERE.md`](docs/pack/README_START_HERE.md). Live status: [`docs/pack/00_GOVERNANCE/PROGRESS_AND_DECISION_LOG.md`](docs/pack/00_GOVERNANCE/PROGRESS_AND_DECISION_LOG.md).

## Current state (verified only)

| Layer | Status | Evidence |
|---|---|---|
| Database foundation (Phases 1–2) + MVP domain schema + invitations + private evidence storage + app RPCs/guards | Implemented, tested: 17 pgTAP files / 250 assertions pass locally (PG 16) and on Supabase (PG 17); CI runs them on every push | `supabase/migrations/`, `supabase/tests/`, `scripts/test-db.sh` |
| Hosted dev database | Provisioned: Supabase `crux-process-policy-intelligence` (`pahzxpileudulljgaciw`, ap-south-1 Mumbai, Free plan), migrations PPI-001…023 applied, private bucket `evidence-private`; tenants: live **CRUX** (pilot, D-030) and synthetic `E2E-SYNTH` (D-025). Auth: access-token hook on, public sign-ups off | `docs/pack/00_GOVERNANCE/PROGRESS_AND_DECISION_LOG.md` S-02 |
| Web app | **Live: https://crux-ppi.netlify.app** (Netlify, auto-deploys `main`). Implemented, tested end-to-end on the live site: administration (departments, processes, invitations, roles), sign-in (magic link, invitation-only), accept invitation, discovery setup, respondent interview with autosave/revisions/submit, process-status table. | `web/`, `web/e2e/interview-flow.cjs` |
| AI adaptive interview | **Live** (12-Nov-2026): Supabase Edge Function `interview-ai`, Gemini free tier (`gemini-flash-lite-latest` → gemini-3.5-flash-lite), owner-accepted data use recorded; real end-to-end test 15/15; CRUX join link uses it | [`AI_INTEGRATION.md`](AI_INTEGRATION.md), [`TEST_RESULTS.md`](TEST_RESULTS.md), [`PROJECT_GAP_AUDIT.md`](PROJECT_GAP_AUDIT.md) |

Nothing here is approved CRUX policy. Seed data is synthetic.

## Design rule: the database enforces governance

Business invariants are enforced in PostgreSQL (RLS + triggers), so they hold for any client — web app, API, background worker or `service_role`:

- tenant isolation via composite `(company_id, id)` foreign keys + RLS;
- scoped, deny-by-default permissions (`private.has_permission`);
- append-only employee answers, clarification responses, dispute positions, approval decisions, audit events;
- human-only verification, dispute decisions, approvals and publication (service/AI identities are refused);
- documents publish only after every configured route step is approved; published versions are immutable;
- hosted AI providers are refused data above their approved classification.

## Layout

```text
docs/pack/                 project pack (requirements, governance, registers)
docs/ENTITY_RELATIONSHIP_DIAGRAM.md
docs/DATABASE_SCHEMA_REFERENCE.md   (generated from the live test DB)
supabase/migrations/       ordered migrations: <timestamp>_ppi_<nnn>_<name>.sql
supabase/seed/             SYNTHETIC data only (2 companies)
supabase/functions/        Edge Function interview-ai + shared AI adapter/engine (+ mocked unit tests)
supabase/tests/            pgTAP tests; _harness/ = local Supabase stubs (never deployed)
scripts/test-db.sh         clean-install + full test run on a throwaway Postgres
web/                       Next.js app (user JWT only; never service_role)
```

## Run the web app locally

```bash
cd web && cp .env.example .env.local   # fill in the publishable key (public; RLS protects data)
npm ci && npm run dev
```

Supabase Auth is configured (hook on, sign-ups off). Still to do: Site URL / redirect URLs once deployed, custom SMTP for email links. People join by invitation with a one-time temporary password (Administration page).

## Run the database tests locally

Requires PostgreSQL 15+ binaries and the pgTAP extension.

```bash
./scripts/test-db.sh            # creates a throwaway cluster, applies all migrations + seed, runs tests, deletes cluster
```

Hosted dev project: `pahzxpileudulljgaciw` (Mumbai). Migration file timestamps match the project's migration history, so `supabase link --project-ref pahzxpileudulljgaciw && supabase db push` applies only new files. The `_harness` stub is **not** applied on Supabase — Supabase provides `auth`, `anon`, `authenticated`, `service_role`.
