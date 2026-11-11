# CRUX Process & Policy Intelligence Platform

Governed, source-traceable, permission-controlled company knowledge system for CRUX Risk Management Pvt. Ltd.
Requirements baseline: [`docs/pack/README_START_HERE.md`](docs/pack/README_START_HERE.md). Live status: [`docs/pack/00_GOVERNANCE/PROGRESS_AND_DECISION_LOG.md`](docs/pack/00_GOVERNANCE/PROGRESS_AND_DECISION_LOG.md).

## Current state (verified only)

| Layer | Status | Evidence |
|---|---|---|
| Database foundation (Phases 1–2) + MVP domain schema | Implemented, tested locally | `supabase/migrations/`, `supabase/tests/`, `scripts/test-db.sh` |
| Hosted database | Not provisioned | AQ-019 |
| Application UI / API | Not Started | — |
| AI provider adapter | Not Started (DB-level provider policy guard only) | `ai_provider_policies` |

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
supabase/tests/            pgTAP tests; _harness/ = local Supabase stubs (never deployed)
scripts/test-db.sh         clean-install + full test run on a throwaway Postgres
```

## Run the database tests locally

Requires PostgreSQL 15+ binaries and the pgTAP extension.

```bash
./scripts/test-db.sh            # creates a throwaway cluster, applies all migrations + seed, runs tests, deletes cluster
```

On Supabase (once a project exists): `supabase db push` then `supabase test db`. The `_harness` stub is **not** applied on Supabase — Supabase provides `auth`, `anon`, `authenticated`, `service_role`.
