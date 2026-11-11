# Architecture Decision Register

**Status labels:** Proposed / Accepted / Rejected / Superseded / Needs validation.

| ID | Topic | Current proposal | Status | Validation required |
|---|---|---|---|---|
| ADR-001 | Application shape | Modular monolith first; clean internal service boundaries | Proposed | Confirm existing repo and team capability |
| ADR-002 | Frontend | Next.js + React + TypeScript | Proposed | Inspect existing app before replacing anything |
| ADR-003 | Database | PostgreSQL | Proposed | Confirm hosting, backup, region and access needs |
| ADR-004 | Initial managed platform | Supabase may be used for prototype | Proposed | Verify current free-tier limits, data location, RLS and terms |
| ADR-005 | Authentication | Supabase Auth if Supabase selected | Proposed | Validate invitation flows, MFA options and admin needs |
| ADR-006 | File storage | Private object storage with DB metadata | Proposed | Confirm retention, file size, malware and access approach |
| ADR-007 | AI provider abstraction | Provider adapter interface | Accepted design principle | Define supported APIs after proof of concept |
| ADR-008 | Local AI | Ollama as local inference option | Proposed | Hardware/model quality/latency test |
| ADR-009 | Hosted AI | Optional approved providers such as Gemini/Groq | Proposed | Check live quotas, terms, retention and data processing before use |
| ADR-010 | Agent pattern | One orchestrator with specialist task prompts | Proposed | Evaluate quality on representative synthetic cases |
| ADR-011 | Background tasks | Retryable worker/queue | Proposed | Select simplest suitable implementation |
| ADR-012 | Process mapping | React Flow initially; assess BPMN needs | Proposed | Confirm export, notation and editing needs |
| ADR-013 | Search | PostgreSQL search first; semantic search later if justified | Proposed | Test query quality and permission filtering |
| ADR-014 | Tenant model | Company ID on tenant-owned records; tenant-safe FKs and RLS | Accepted design principle | Threat-model and test with two synthetic companies |
| ADR-015 | Human approval | AI cannot publish/approve official content | Accepted | Implement server-side state transition guards |
| ADR-016 | Source history | Preserve original statements and revision links | Accepted | Confirm immutability strategy and retention policy |
| ADR-017 | Legal review | Qualified Indian legal/compliance reviewer required | Accepted | Identify authorised role and evidence requirements |
| ADR-018 | MVP delivery | End-to-end vertical slice before breadth | Accepted | Select pilot department/process |
| ADR-019 | Enforcement layer | Governance invariants (tenant isolation, append-only history, human-only decisions, approval completeness, publication immutability, AI data caps) enforced in PostgreSQL RLS + triggers | Implemented (S-01), not accepted | Owner review; app must use user JWT, never service_role, for user actions |
| ADR-020 | Identifiers | UUID PKs; composite `(company_id, id)` FKs for tenant safety; business codes unique per company | Implemented (S-01) | — |
| ADR-021 | Migrations | Timestamped Supabase-style SQL migrations `YYYYMMDDHHMMSS_ppi_<nnn>_<name>.sql`; pgTAP tests; clean-install script | Implemented (S-01) | Run on Supabase PG 17 dev project |

## Open decisions to resolve before production

1. Is initial use single-company only, or are multiple legal entities required from day one?
2. Which hosting/data region and contractual privacy requirements apply?
3. What classifications are used for employee, client, partner and regulated information?
4. Which departments and roles are in the first pilot?
5. Who has final authority to approve each document class?
6. What retention, archival and deletion rules apply?
7. Are BPMN 2.0 import/export or formal notation standards required?
8. Which email/identity system will be used for invitations and notifications?
9. Which AI data categories may be sent to which external providers, if any?
10. What recovery time and recovery point objectives are acceptable?

## Decision discipline

Any material change must include: decision ID, date, proposer, context, options considered, decision, rationale, affected documents/modules, migration impact, security impact and approver. Claude must not silently convert a proposed choice into an accepted organisational decision.
