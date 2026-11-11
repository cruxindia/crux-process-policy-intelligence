# Phase-Specific Claude Prompts

Use these after the Master Claude Build Prompt. Give Claude the relevant project-pack documents and the current repository context. Run one phase prompt at a time; do not ask Claude to implement every phase in one response.

## Prompt 0 — Repository audit and requirements coverage

```text
Read the complete CRUX project pack. Inspect the actual repository before
changing files. Create REPOSITORY_AUDIT.md and REQUIREMENTS_TRACEABILITY_MATRIX.md.
For every PRD requirement, map it to: existing file/component, status
(implemented/tested/partial/missing), evidence, gap, dependency and next action.
Identify the actual framework, database, auth, storage, AI, tests and deployment.
Preserve working code. Do not build new features in this task. Update the
progress log with verified facts only. Do not claim a test or migration ran
unless it did.
```

## Prompt 1 — Product and architecture freeze

```text
Using MASTER_PRD.md, SYSTEM_ARCHITECTURE.md, ARCHITECTURE_DECISION_REGISTER.md
and the repository audit, create a consolidated architecture baseline.
Produce: context diagram, container/component diagram, data-flow diagrams,
trust boundaries, integration catalogue, assumptions/open questions and
architecture decision updates. Compare at least two viable options for any
major unresolved choice. Recommend a simple modular-monolith MVP with one AI
orchestrator and a provider adapter unless the existing repository provides a
strong reason otherwise. Do not introduce paid dependencies as requirements.
Do not code. Mark all decisions Proposed until CRUX approval.
```

## Prompt 2 — Data model, ERD and migrations

```text
Read DATA_MODEL_BLUEPRINT.md, MASTER_PRD.md and the actual existing schema.
Create an entity relationship diagram and DATABASE_SCHEMA_REFERENCE.md.
Design ordered PostgreSQL migrations for organisation/membership, process,
interview, evidence, knowledge, workflow, risk and document domains. Enforce
tenant-safe relationships, source provenance, append-only/revision-linked
answers, explicit lifecycle states and indexes. Identify circular references
and migration ordering. Do not blindly reuse a draft SQL snippet. Implement
only the smallest foundation migration, run it against a clean disposable
development database if available, and report exact results. RLS policies must
be designed and tested before real data is loaded. Use synthetic fixtures only.
```

## Prompt 3 — Roles, permissions and tenant security

```text
Read ROLES_PERMISSIONS_SECURITY.md and the actual auth/database design.
Produce a detailed permission matrix for view/create/edit/submit/assign/review/
verify/dispute/approve/publish/retire/export/admin actions, scoped by company,
department, process, location, classification and assignment. Separate job
title, membership, role and approval authority. Implement deny-by-default
backend checks and database RLS. Create positive and negative tests using two
synthetic companies and multiple departments. Test direct API calls and changed
record IDs, not only UI visibility. Do not use broad temporary policies.
```

## Prompt 4 — Department, Company DNA, VOC and CTQ discovery

```text
Use the department/process and Company DNA/VOC/CTQ templates. Design the
catalogues, interview workflows, records, source fields, review status and
screens. Provide an adaptive question plan that avoids asking the same question
again when a reliable answer already exists. Distinguish source statement,
AI theme, management decision and approved record. Implement only the smallest
usable discovery slice and tests. Do not invent actual CRUX departments,
customers, strategy, values or targets; use clearly labelled synthetic data.
```

## Prompt 5 — Adaptive interview engine

```text
Build the interview engine from the PRD and INTERVIEW_KNOWLEDGE_AND_PROVENANCE.md.
Support campaigns, assignments, sessions, question templates, adaptive question
selection, text/structured answer types, autosave/resume, explicit unknown/not
applicable/depends/refer-to-owner answers, evidence attachment and submit/review.
Store question version, reason and AI provenance. Implement schema validation
for AI question output and a manual fallback. Test vague answers, branching,
repeat avoidance, session recovery and answer correction without overwriting
originals. Do not build the entire multi-agent system.
```

## Prompt 6 — Knowledge, provenance and evidence

```text
Implement the shared knowledge and evidence model. Every material claim must
retain type, scope, creator, origin, source IDs/locators, status, version and
review history. Distinguish direct employee statement, document evidence,
system extract, management decision, external reference and AI inference.
Build secure private upload and source linking. Test permission-limited access,
hash/metadata, original answer preservation, revisions, disputes and superseded
sources. AI-generated claims without valid sources must be marked as hypotheses.
```

## Prompt 7 — Process intelligence and visual mapping

```text
Read the process discovery template. Implement structured process versions,
steps, edges, role assignments, inputs/outputs, decisions, handoffs, exceptions,
SLAs, controls and source links. Then generate an editable visual map using the
selected library. Include swimlanes and clear branch labels. Flag missing owners,
missing outputs, orphan nodes and unsupported assumptions. Map edits must create
tracked versions. The diagram must be generated from structured data, not be the
sole source of truth. Add a representative end-to-end test.
```

## Prompt 8 — Cross-department clarification and disputes

```text
Implement clarification tasks and formal disputes. A task must have requester,
assignee, process/record, exact question, due date, status, response and evidence.
A dispute must preserve competing claims, participants, context, sources,
impact, decision owner, decision rationale and linked revisions. Add in-app
reminders and configurable escalation using idempotent background jobs. AI may
summarise positions but must not decide the dispute or erase a claim. Test a
conflict between two departments and an authorised resolution.
```

## Prompt 9 — Risk, controls and legal applicability

```text
Implement risk/control and legal applicability support from the guardrails
 document. For risk, use a documented, versioned scoring method that CRUX must
approve; do not invent ratings. Link risks and controls to process steps and
evidence. For legal research, capture entity/activity/jurisdiction/date context,
authority, provision, source URL, publication/effective/retrieval dates and
applicability rationale. The model may create candidates only. Confirmation
must require qualified Indian legal/compliance review. Never claim compliance
or provide final legal advice. Add status and publication gates.
```

## Prompt 10 — Controlled documents and approval

```text
Implement controlled document generation from reviewed/approved structured
sources. Support templates, source lists, gap/assumption report, document owner,
classification, version, effective/review date, reviewers, approvers and change
summary. Add configurable sequential/parallel approval routes and delegation.
Enforce approval on the server. Published versions must be immutable; changes
create new versions. Add notification and acknowledgement tracking. Test that
publication is blocked when any required approval is missing and that an old
published version remains unchanged after revision.
```

## Prompt 11 — Dashboards, testing and deployment

```text
Implement role-scoped dashboards with metric definitions and source queries.
Cover discovery, interview completion, process coverage, source completeness,
open/aged clarifications and disputes, approval pipeline, overdue reviews,
risks/controls and improvement actions. Complete test strategy, security tests,
AI evaluation cases, synthetic data, monitoring, backup/restore, incident
runbook and pilot acceptance checklist. Do not call the product production-ready
until security review, restore test, user acceptance and operational ownership
are evidenced. Update the progress log and handover documentation.
```

## Prompt 12 — Red-team and completeness review

```text
Act as an independent enterprise architecture reviewer, security tester,
process governance auditor and product QA lead. Compare the actual application
and repository to the PRD and all functional requirements. Identify missing
requirements, insecure access paths, cross-tenant leaks, prompt injection,
unsupported AI claims, source provenance failures, approval bypasses, mutable
published documents, stale legal sources, untested background retries and
operational gaps. Categorise issues Critical/High/Medium/Low, provide exact
reproduction steps and recommended fixes. Do not mark a finding resolved until
there is test evidence. Update the risk register and release recommendation.
```
