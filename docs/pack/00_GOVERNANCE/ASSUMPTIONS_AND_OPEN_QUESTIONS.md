# Assumptions and Open Questions

This register prevents assumptions from being mistaken for approved CRUX decisions.

| ID | Topic | Current working assumption | Decision/evidence needed |
|---|---|---|---|
| AQ-001 | Initial deployment scope | Start with CRUX only; design tenant-safe for future entities/tenants | Confirm whether multiple legal entities need day-one separation |
| AQ-002 | Department catalogue | Use configurable department hierarchy | Obtain current approved department and location list |
| AQ-003 | First pilot | One manageable process from one department, with one participating department | Management to select pilot department/process/owners |
| AQ-004 | Identity | Authenticated users with company memberships | Confirm SSO/email domain/invitation approach |
| AQ-005 | Roles | Role names in pack are candidates | Approve actual authority and delegation matrix |
| AQ-006 | Approval authority | Document-type-specific routes | Confirm who approves policies, SOPs, risk acceptances and exceptions |
| AQ-007 | AI confidentiality | External provider use restricted until approved | Define allowed data classifications per provider |
| AQ-008 | Local AI | Ollama may be used if local hardware supports required quality | Validate hardware, model quality, concurrency and support ownership |
| AQ-009 | Hosting | Supabase is a candidate prototype host | Confirm region, contractual terms, backup, RLS and free-tier fit |
| AQ-010 | Process notation | React Flow may be sufficient for first map | Confirm whether BPMN import/export or formal conformance is required |
| AQ-011 | Document templates | Templates to be controlled by document type | Obtain existing CRUX template standards and branding |
| AQ-012 | Data retention | Configurable retention required | Legal/privacy review to establish schedules and deletion rules |
| AQ-013 | Legal applicability | Qualified Indian legal review required | Identify designated reviewer and scope of advice |
| AQ-014 | Notifications | In-app first, email later | Confirm approved email provider and sender/domain configuration |
| AQ-015 | Reporting metrics | KPI definitions need owner/source | Approve definitions for discovery, process, risk and document metrics |
| AQ-016 | Language | Initial interface assumed English | Confirm need for multilingual interviews/documents |
| AQ-017 | Availability/recovery | No RTO/RPO set | Management/IT to define acceptable downtime and data loss |
| AQ-018 | Repository | None exists; propose private `cruxindia/crux-process-policy-intelligence` | **Resolved S-02:** `cruxindia/crux-process-policy-intelligence` (private). Open: who else gets access |
| AQ-019 | Database account | Phase 1 runs on local disposable Postgres; current Supabase org has no free active slot | **Resolved S-02 (dev):** owner paused `ledger-personal`; dev project `pahzxpileudulljgaciw` (Mumbai). Open: where prod/pilot will live |
| AQ-020 | Inactive Supabase project `final_schema` | Unrelated to this platform (not inspected) | Owner to confirm purpose; do not reuse without inspection |
| AQ-021 | MVP baseline and phase order | Master §13 MVP; DNA/VOC/CTQ after MVP (C-01, C-02) — applied as working default (D-017) | Owner approval |
| AQ-022 | Process approval separation of duties | Process owner may approve own process version (not blocked) | Should process approval require someone other than the editor? |
| AQ-023 | Who may delegate a role | Only holders of `role.manage` can record delegations | Should department heads delegate their own authority during leave? |

## Rule

Claude may propose reversible technical defaults, but must not invent CRUX department names, reporting lines, employee data, legal obligations, approval authorities or operational targets. Record assumptions explicitly and seek confirmation only when the decision is genuinely blocking or high-impact.
