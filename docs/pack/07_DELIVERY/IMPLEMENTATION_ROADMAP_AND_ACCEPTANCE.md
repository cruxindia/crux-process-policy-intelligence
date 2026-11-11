# Implementation Roadmap and Acceptance Plan

## 1. Delivery method

Use dependency-ordered, short build sprints. Each sprint should produce one inspectable artefact or one tested vertical slice. The project should progress even when a previous sprint is incomplete: record the blocker, reduce scope and continue with the highest-value dependency.

Do not begin by building a huge multi-agent platform. Prove one secure end-to-end path, then expand.

## 2. Phases and gates

### Phase 0 — Repository and product baseline
**Outputs:** repository inventory; confirmed product scope; PRD; architecture; decision log; risk/assumption register.

**Gate:** Claude has inspected actual repository and distinguishes existing working code from proposed design. No unverified completion claims.

### Phase 1 — Architecture and data foundation
**Outputs:** architecture decisions; schema ERD; migrations; environment configuration; tenant model; seed data.

**Gate:** migrations run on clean dev DB; foreign keys and tenant scoping tested; synthetic seed data works; no production secrets in repository.

### Phase 2 — Identity, roles and security
**Outputs:** authentication; memberships; roles; permission model; RLS/backend policy; audit baseline; data classification.

**Gate:** positive and negative access tests pass, including cross-company and cross-department tests.

### Phase 3 — Organisation and discovery catalogue
**Outputs:** company, departments, locations, roles, department profile and process catalogue screens.

**Gate:** authorised admin can set up a small test organisation; department head can review profile; all changes audited.

### Phase 4 — Company DNA, VOC and CTQ
**Outputs:** discovery templates, records, source links, review process and summary views.

**Gate:** candidate and approved statements are visibly distinct; CTQ has definition, measure, source and owner.

### Phase 5 — Interview engine
**Outputs:** campaign, invitation, session, question templates, adaptive question service, autosave/resume and submission.

**Gate:** a user can complete/resume an interview; original answers persist; AI questions follow schema and are traceable; fallback manual mode works.

### Phase 6 — Knowledge and evidence provenance
**Outputs:** knowledge records, source links, evidence upload, review state, revisions and search.

**Gate:** every generated claim can be traced to source answer/evidence or labelled as unsupported hypothesis; access checks apply to source and search.

### Phase 7 — Process intelligence and mapping
**Outputs:** structured process version, steps, edges, roles, dependencies, exceptions, map renderer/editor and version comparison.

**Gate:** map is generated from structured process data; map nodes link to sources; an incomplete process is clearly flagged.

### Phase 8 — Cross-department collaboration
**Outputs:** clarification tasks, responses, disputes, positions, decisions, comments, reminders and escalation.

**Gate:** conflicting claims remain intact; assigned departments can respond within scope; authorised decision owner can close with rationale.

### Phase 9 — Risk and legal support
**Outputs:** risk/control register, scoring methodology, test evidence, legal-source records and applicability review workflow.

**Gate:** risk ratings use approved method; AI cannot confirm legal applicability; qualified review gate works.

### Phase 10 — Documents and approvals
**Outputs:** templates, document draft generation, source list, review routing, approvals, immutable published versions, acknowledgement and change workflow.

**Gate:** publication impossible until required approvals completed; historical published version remains immutable; source set retained.

### Phase 11 — Dashboard, quality and deployment
**Outputs:** dashboards, reporting, exports, notifications, testing, backup/restore, monitoring, deployment runbook and pilot acceptance.

**Gate:** end-to-end pilot, security tests, restore test, operational ownership and user training completed.

## 3. MVP vertical slice

Pick one pilot department and one process with manageable sensitivity and clear stakeholders. The full vertical slice is:

1. Admin sets up pilot department, participants and role scope.
2. Department head completes department/process discovery.
3. AI asks adaptive process questions and captures answer provenance.
4. Process owner reviews structured process facts.
5. A second department receives a clarification task and responds.
6. AI proposes process map and draft SOP from reviewed data.
7. Business owner and required reviewers review it.
8. Authorised approver approves; system publishes immutable version.
9. Dashboard reports open gaps, completed steps and document status.

The selected pilot process must be chosen by CRUX stakeholders; Claude must not invent it.

## 4. Sprint definition of done

Every sprint response must state:
- objective;
- why it matters;
- exact 15-minute actions (or a clearly labelled stretch task if work is larger);
- output file/code to save;
- file path;
- completion check;
- blockers/assumptions;
- update to progress log;
- next dependency.

For coding sprints, include exact files changed and tests run. Do not claim tests passed unless run and results are visible.

## 5. Dependency rules

- Do not build UI before core data contracts are understood.
- Do not implement detailed approvals before roles/authority are defined.
- Do not expose data to AI before access and classification rules exist.
- Do not generate final SOPs from unverified knowledge.
- Do not build legal conclusions into a generic risk prompt.
- Do not add a vector database until search/retrieval testing demonstrates need.
- Do not integrate multiple providers until one adapter works end-to-end.
- Do not deploy production before backup, access-control, security and operational checks.

## 6. Prioritisation if time or resources are limited

P0: authentication, tenant isolation, organisation, interviews, source traceability, review states, one clarification workflow, basic process output, approval gate.  
P1: richer maps, document versions, notifications, dashboards, risk/control.  
P2: advanced legal research assistance, semantic retrieval, analytics, multiple provider routing, integrations and automation.

Security, auditability and human approval are not optional P2 enhancements; they are foundational constraints.

## 7. Pilot exit criteria

- Defined pilot scope, owner and participants.
- No unresolved critical security vulnerabilities.
- Access-control tests pass.
- Backup and restore process tested.
- Interview completion and resumption tested on mobile and desktop.
- AI outputs are source-aware and human-reviewed.
- Cross-department clarification works.
- Draft map and SOP can be generated and corrected.
- Approval/publication cannot be bypassed.
- Published version and prior history are retrievable.
- Users are trained and support/incident contacts identified.
- Data retention and external provider rules approved.
