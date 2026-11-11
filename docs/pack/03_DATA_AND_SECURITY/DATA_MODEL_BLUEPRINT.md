# Data Model Blueprint

**Purpose:** Define the core entities and integrity rules before implementation of database migrations. This is a logical design, not a final production SQL migration.

## 1. Data modelling principles

1. Every tenant-owned record belongs to a company/tenant and must not reference another tenant's records.
2. Preserve original submissions and create linked corrections/revisions; do not overwrite history.
3. Separate identity, role assignment, business ownership and approval authority.
4. Separate raw source material, extracted claims, AI interpretation and approved knowledge.
5. Separate AS-IS observations from TO-BE proposals and approved policies.
6. Keep lifecycle state explicit and enforce allowed transitions in the backend/database.
7. Store files in private object storage; store metadata, hashes, classification and relationships in PostgreSQL.
8. Keep structured data relational; use JSON only for genuinely variable payloads with schema validation.
9. Apply tenant-aware foreign keys, indexes and RLS to all relevant tables.
10. Audit sensitive actions and important state changes.

## 2. Core entity catalogue

### 2.1 Organisation and identity

| Entity | Key fields | Purpose |
|---|---|---|
| companies | id, legal/display name, slug, timezone, status | Tenant/company boundary |
| business_entities | id, company_id, legal name, identifier metadata, jurisdiction, status | Optional legal entities/business units where required |
| locations | id, company_id, parent location, code, name, geography, status | Geographic/operating locations |
| departments | id, company_id, parent department, code, name, mandate, status | Function hierarchy |
| memberships | id, company_id, auth user ID, employee reference, display name, status | User-company relationship |
| roles | id, company_id or global role template, name, description | Configurable role definitions |
| permissions | permission key, description, resource/action | Atomic permission catalogue |
| role_permissions | role, permission, optional scope constraints | Role-to-permission mapping |
| membership_roles | membership, role, scope, effective dates, delegator | User's scoped role assignments |
| approval_authorities | role/membership, document/process category, limits, scope, effective dates | Formal decision rights |

Do not assume that a job title is a role or a permission. One person may hold several role assignments in different scopes.

### 2.2 Function and process catalogue

| Entity | Key fields | Purpose |
|---|---|---|
| department_profiles | department, purpose, services, customers, inputs, outputs, systems, owner, revision | Department discovery profile |
| processes | company, code, name, purpose, trigger, scope, owner, lifecycle status | Process master record |
| process_departments | process, department, involvement type, accountable contact | Many-to-many participation |
| process_versions | process, version number, AS-IS/TO-BE, status, change summary | Controlled process revision |
| process_steps | process version, sequence, step type, description, actor, system, duration | Process activities and events |
| process_edges | process version, source step, target step, condition, sequence | Flow connections and decisions |
| process_roles | process version/step, role or membership, responsibility type | RACI/role mapping |
| process_inputs_outputs | process/step, direction, item, source/recipient, format | Inputs, outputs and handovers |
| process_dependencies | process, upstream/downstream process, dependency type | Cross-process relationships |
| process_metrics | process, metric, definition, unit, target, source, owner | SLA/TAT, quality, volume and other measures |
| process_exceptions | process/step, trigger, handling, escalation, owner | Exceptions and failure paths |

Process maps should be generated from structured versioned steps and edges. A diagram image alone is not the authoritative process definition.

### 2.3 Interview and discovery

| Entity | Key fields | Purpose |
|---|---|---|
| interview_campaigns | company, name, scope, audience, template/version, dates, owner, status | Coordinated discovery initiative |
| interview_assignments | campaign, membership, department/process, due date, token/status | Assign a person to a discovery task |
| interview_sessions | assignment, participant, type, status, started/completed timestamps | One interview attempt/session |
| question_templates | type, prompt, expected fields, branch logic, version | Reusable interview question logic |
| interview_questions | session, sequence, question text, rationale, source/template, model metadata | Actual question presented |
| interview_answers | question, responder, answer payload, answer type, submitted time, revision link | Original answer or correction |
| answer_reviews | answer, reviewer, status, comment, decision, timestamp | Human review without editing raw answer |
| interview_session_summaries | session, structured output, gaps, generated time, prompt/model version | Draft synthesis linked to answers |

An answer may be text, selection, numeric, date or structured JSON, but each type must have validation and a clear schema. "I don't know", "not applicable", "depends" and "refer to another owner" are explicit answer states, not blank strings.

### 2.4 Evidence and files

| Entity | Key fields | Purpose |
|---|---|---|
| evidence_files | company, private storage key, name, MIME, size, hash, classification, uploader, dates | File metadata |
| evidence_links | evidence, source object type/id, relevance, page/section/locator, note | Link evidence to answer, knowledge, risk, process or document |
| evidence_reviews | evidence, reviewer, authenticity/relevance status, note | Human review of evidence |
| external_references | title, authority/source, URL, publication/effective dates, retrieval date, checksum | Legal, regulatory or external reference metadata |

Do not assume that an uploaded file is authentic, current, approved or relevant merely because it is attached.

### 2.5 Knowledge and provenance

| Entity | Key fields | Purpose |
|---|---|---|
| knowledge_records | company, type, title, claim/content, scope, status, owner, origin, confidence, version | Shared knowledge item |
| knowledge_sources | knowledge record, source type/id, source span/locator, relationship, note | Provenance links |
| knowledge_revisions | knowledge record, revision, previous revision, content snapshot, author, timestamp, reason | History of revisions |
| knowledge_reviews | record/revision, reviewer, outcome, rationale, timestamp | Verification and approval history |
| knowledge_relationships | subject, predicate, object, scope, status | Related facts, dependencies and contradictions |
| knowledge_tags | tag and record links | Taxonomy and retrieval |

Suggested source types: employee answer, approved document, evidence file, system record, external source, management decision, imported record and AI analysis. AI analysis is not equivalent to an independent source.

### 2.6 Collaboration and disputes

| Entity | Key fields | Purpose |
|---|---|---|
| clarification_tasks | requester, assignee, affected process/record, question, priority, due date, status | Request missing information |
| clarification_responses | task, responder, answer, source links, submitted time | Responses and evidence |
| disputes | issue, competing claims, impact, owner, status, resolution | Formal disagreement record |
| dispute_participants | dispute, membership, responsibility, participation status | Involved stakeholders |
| dispute_positions | dispute, participant, position, source links, date | Separate positions |
| dispute_decisions | dispute, decision owner, outcome, rationale, date, approval link | Recorded resolution |
| comments | object reference, author, text, visibility, timestamps | Discussion; use typed references or safe relational associations |
| tasks | task type, linked object, owner, assigner, due date, status, priority | General work tracking |
| notifications | recipient, type, payload reference, delivery state, read time | In-app/email notifications |

### 2.7 Risk and compliance

| Entity | Key fields | Purpose |
|---|---|---|
| risks | company, category, event, cause, impact, process, status, owner | Risk register |
| risk_assessments | risk, methodology/version, likelihood, impact, rating, assessor, date | Inherent/residual assessments |
| controls | objective, type, description, owner, frequency, evidence, status | Control catalogue |
| risk_controls | risk, control, coverage/effectiveness assessment | Risk-control mapping |
| control_tests | control, test procedure, sample, result, tester, date, evidence | Test of control operation |
| legal_requirements | jurisdiction, authority, provision, subject, effective dates, source, status | Candidate/validated legal obligation |
| applicability_assessments | requirement, entity/activity/location, rationale, reviewer, outcome, date | Context-specific applicability |
| compliance_actions | requirement/risk, action, owner, due date, status, evidence | Remediation and compliance follow-up |

Legal requirements and applicability must be versioned with source dates. Do not infer that a statute applies to CRUX merely because it appears in a generic search result.

### 2.8 Document governance

| Entity | Key fields | Purpose |
|---|---|---|
| document_types | type, required metadata, approval route, template | SOP/policy/manual/checklist classification |
| documents | company, code, title, type, owner, classification, current published version, status | Document identity |
| document_versions | document, version, content/file, change summary, status, author, dates | Immutable draft/review/published versions |
| document_sources | document version, source knowledge/process/risk/evidence, locator | Source traceability |
| review_cycles | version, reviewer, due date, status, comments | Review route |
| approval_requests | version, approval step, approver/role, due date, status | Approval workflow |
| approval_decisions | request, actor, decision, rationale, timestamp, delegation | Immutable decision event |
| document_acknowledgements | published version, recipient, state, timestamp | Read/acknowledgement tracking |
| document_distribution | version, recipient/group, notification/delivery state | Controlled distribution |
| change_requests | current object/version, reason, impact, requester, owner, status | Controlled change initiation |

### 2.9 Improvement, metrics and audit

| Entity | Key fields | Purpose |
|---|---|---|
| improvement_ideas | source/problem, proposed change, benefit, owner, status | Improvement register |
| improvement_trials | idea, scope, hypothesis, start/end, measures, result | Pilot or test |
| improvement_decisions | trial/idea, decision, rationale, approver, date | Adopt/reject/defer |
| metric_definitions | name, formula, unit, direction, source, owner | Consistent KPI definitions |
| metric_observations | metric, scope, period, value, source, validation | Recorded performance |
| audit_events | actor, action, resource, scope, timestamp, reason, correlation ID, safe metadata | Audit trail |
| ai_runs | task, provider, model, prompt version, input/output references, status, latency, token/cost metadata | AI execution tracking |
| prompt_versions | task key, version, prompt/template, schema, approval status | Controlled prompt management |

## 3. Status lifecycle recommendations

### Knowledge record
`ai_suggested → employee_submitted → under_review → verified → approved` with alternative outcomes `disputed`, `rejected` or `superseded`.

Not every item requires both `verified` and `approved`; the required path depends on knowledge type. Document and policy rules must define which states are mandatory.

### Process
`candidate → discovery → draft → cross_functional_review → risk_review → approval_pending → approved → active → under_review → superseded/retired`.

### Interview
`invited → in_progress → submitted → review_pending → reviewed → closed` with reopen/clarification path.

### Clarification
`open → assigned → response_submitted → requester_review → resolved` or `disputed/escalated/cancelled`.

### Controlled document version
`working_draft → review → changes_requested → approval_pending → approved → published → superseded/withdrawn`.

## 4. Data integrity requirements

- Tenant-safe foreign keys for all tenant-owned relationships.
- No cross-company source links.
- Unique business codes within company and relevant scope.
- One current published version per document, enforced transactionally.
- Published versions immutable; corrections create new versions.
- State transitions validated server-side and preferably constrained at database/service layer.
- Prevent self-referential or circular revision chains where inappropriate.
- Use transactions for approval and publication.
- Store timestamps in UTC; display in configured company/user timezone.
- Use soft deactivation for identity/organisation records where history requires retention.
- Implement retention/deletion rules with legal/privacy review.
- Add indexes based on observed query patterns and explain plans.

## 5. Search and vector design

Do not begin with embeddings for every row. First implement reliable structured search and PostgreSQL full-text search. Add semantic/vector retrieval only after a representative test set proves it useful. Every chunk/vector must retain source record ID, company/tenant ID, classification, department/process scope, version and access metadata. Retrieval must filter by permissions before content is passed to an AI model, and the backend must re-check permissions before displaying results.

## 6. Migration strategy

- Use ordered, version-controlled migrations.
- Separate schema creation, data backfill and security policy changes.
- Test migrations on disposable development databases.
- Seed only synthetic data.
- Verify rollback/forward-fix strategy.
- Never use service-role credentials in client code.
- Do not enable broad policies to make development easier.
- The earlier conversation's starter schema is a draft concept only; Claude must review it against this blueprint before reusing or executing it.
