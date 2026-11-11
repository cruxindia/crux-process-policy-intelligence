# Project Risk and Dependency Register

| ID | Risk/dependency | Impact | Mitigation / owner to confirm | Status |
|---|---|---|---|---|
| PR-001 | Unclear authority matrix | Invalid reviews/approvals | Define roles, scope and delegation before controlled publication | Open |
| PR-002 | Confidential data sent to free hosted AI | Privacy/contractual exposure | Data classification, provider approval, local-first path and redaction | Open |
| PR-003 | Weak tenant isolation/RLS | Cross-department or cross-company data exposure | Threat model, RLS and backend tests before pilot | Open |
| PR-004 | AI hallucinations treated as facts | Incorrect process/policy | Source provenance, confidence caveats and human validation | Open |
| PR-005 | Incomplete interview responses | Inaccurate maps/documents | Adaptive questions, gap reports and reviewer checks | Open |
| PR-006 | Conflicting department accounts | Process dispute and delay | Structured positions, evidence and authorised decision owner | Open |
| PR-007 | Unclear legal applicability | Incorrect legal policy | Current primary sources and qualified Indian legal review | Open |
| PR-008 | Free-tier quotas/availability change | Service interruption | Provider abstraction, local/manual fallback and quota monitoring | Open |
| PR-009 | Local model hardware inadequate | Poor latency/quality | Benchmark before commitment; optional approved hosted provider | Open |
| PR-010 | Scope too broad for MVP | Delivery delay | One end-to-end vertical slice and staged releases | Open |
| PR-011 | No reliable backup/restore | Data loss | Document and test backup/restore before production | Open |
| PR-012 | Document approval bypass | Uncontrolled policy publication | Server-side state guard, immutable versions and audit | Open |
| PR-013 | Prompt injection in evidence | Data exfiltration/unsafe actions | Treat source content as untrusted; no privileged tool execution | Open |
| PR-014 | Stale source documents | Wrong process/legal statement | Version/effective dates and stale-source warnings | Open |
| PR-015 | Unclear retention/privacy obligations | Over-retention or unlawful handling | Qualified review and configurable retention controls | Open |
| PR-016 | Supabase free organisation already at 2/2 active projects (verified 2026-11-11) | No hosted dev/pilot DB without pausing a live project or using another account | Owner paused `ledger-personal`; dev project created (S-02). Org is again at 2/2 active — a separate prod/pilot project will need another slot or paid plan | Mitigated (dev) / Open (prod) |
| PR-017 | Free/unpaid hosted AI tiers may use inputs to improve products and allow human review (Gemini API terms, fetched 2026-11-11) | Confidential employee/process data disclosed to provider | Proposed D-011: unpaid tiers for synthetic/public data only; provider-policy check in adapter (AC-10) | Open |
| PR-018 | No code repository exists | No evidence home for migrations, tests, progress | Private repo created + CI green (S-02) | Closed |
| PR-020 | Tests ran on PostgreSQL 16.15; Supabase runs PostgreSQL 17 | Behaviour differences undetected | Hosted PG 17.11: schema fingerprint identical; 66/66 hosted assertions pass (S-02); all files 01–09 pass hosted (S-03) | Closed |
| PR-021 | DB-enforced rules can be bypassed by superuser/migration scripts | Silent governance breach by operators | Restrict owner credentials; audit migrations; triggers still fire for service_role | Open |
| PR-022 | App layer only partly built — DB guarantees unproven through real UI/API beyond the interview slice | False sense of completion | RTM tracks DB and App status separately; interview slice proven E2E on Supabase dev (S-04); other features stay "Not Started" until app-tested | Open (reduced) |
| PR-023 | Access-token hook not activated → human-only actions refused in the app | Reviewers/approvers blocked once those screens exist | Fails closed (safe); activate in Supabase Auth → Hooks (D-024) before reviewer UI goes live | Open |
| PR-024 | Supabase built-in email is rate-limited and for development only | Sign-in links not delivered at pilot scale | Configure custom SMTP from a CRUX domain before pilot (D-023) | Open |
| PR-025 | No hosting chosen; Vercel Hobby forbids commercial use | Pilot cannot start; or licence breach if Hobby used | Owner decision D-026 | Open |
| PR-019 | Supabase Free plan: no automatic backups, no PITR, pauses after 1 week inactivity (verified 2026-11-11) | Data loss / pilot downtime; fails backup-restore gate | Scheduled external `pg_dump` + restore drill, or approved paid plan, before pilot (C-11) | Open |

Update owner, likelihood, impact, mitigation, due date and status during project execution. Do not invent residual ratings before an approved assessment method exists.
