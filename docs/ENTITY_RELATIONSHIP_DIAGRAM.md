# Entity Relationship Diagram — MVP domains

**Status:** Implemented (migrations PPI-001…012) · Tested locally (131 pgTAP assertions) · Not accepted · 2026-11-11
Column-level detail: `DATABASE_SCHEMA_REFERENCE.md` (generated). Every tenant table carries `company_id`; relationships below are enforced with composite `(company_id, id)` foreign keys, so a row can only reference rows of the same company.

## 1. Organisation, access and audit

```mermaid
erDiagram
  companies ||--o{ legal_entities : has
  companies ||--o{ locations : has
  companies ||--o{ departments : has
  departments ||--o{ departments : "parent of"
  companies ||--o{ memberships : has
  user_profiles ||--o{ memberships : "person in"
  departments ||--o{ processes : owns
  processes ||--o{ process_departments : "involves"
  companies ||--o{ roles : defines
  roles ||--o{ role_permissions : grants
  permissions ||--o{ role_permissions : "granted via"
  memberships ||--o{ role_assignments : receives
  roles ||--o{ role_assignments : "assigned as"
  role_assignments }o--o| departments : "scoped to"
  role_assignments }o--o| processes : "scoped to"
  role_assignments }o--o| role_assignments : "delegated from"
  companies ||--o{ audit_events : logs
```

## 2. Interview → evidence → knowledge → process

```mermaid
erDiagram
  question_templates ||--o{ interview_questions : "instantiated as"
  interview_campaigns ||--o{ interview_assignments : contains
  memberships ||--o{ interview_assignments : "respondent of"
  interview_assignments ||--o{ interview_sessions : "worked in"
  interview_sessions ||--o{ interview_questions : asks
  interview_questions ||--o{ interview_questions : "follow-up of"
  interview_questions ||--o| interview_answer_drafts : autosave
  interview_questions ||--o{ interview_answers : "answered by (revisions)"
  interview_answers ||--o| interview_answers : supersedes
  knowledge_records ||--o{ knowledge_sources : "cites"
  interview_answers ||--o{ knowledge_sources : "cited as"
  evidence_files ||--o{ knowledge_sources : "cited as"
  knowledge_records ||--o| knowledge_records : supersedes
  knowledge_records ||--o{ knowledge_relationships : relates
  knowledge_records ||--o{ knowledge_reviews : reviewed
  processes ||--o{ process_versions : "versioned as"
  process_versions ||--o{ process_steps : contains
  process_versions ||--o{ process_edges : contains
  process_steps ||--o{ process_edges : "from / to"
  process_steps ||--o{ process_step_sources : "sourced by"
  knowledge_records ||--o{ process_step_sources : supports
  ai_runs ||--o{ knowledge_records : "proposed (draft)"
  ai_runs ||--o{ interview_questions : "generated"
  prompt_versions ||--o{ ai_runs : uses
```

## 3. Collaboration and controlled documents

```mermaid
erDiagram
  clarification_tasks ||--o{ clarification_responses : receives
  clarification_tasks ||--o{ disputes : "may escalate to"
  disputes ||--o{ dispute_positions : "preserves all"
  disputes ||--o| dispute_decisions : "decided by human"
  knowledge_records ||--o{ disputes : "subject of"
  document_types ||--o{ documents : classifies
  document_types ||--o{ approval_routes : "default route"
  approval_routes ||--o{ approval_route_steps : "ordered steps"
  documents ||--o{ document_versions : versions
  document_versions ||--o| document_versions : supersedes
  approval_routes ||--o{ document_versions : "routes"
  document_versions ||--o{ document_version_sources : "built from"
  knowledge_records ||--o{ document_version_sources : "cited by"
  document_versions ||--o{ approval_decisions : "decided (hash-bound)"
  document_versions ||--o{ document_distributions : "delivered"
  document_versions ||--o{ document_acknowledgements : "acknowledged"
  documents ||--o{ document_change_requests : "change requested"
  memberships ||--o{ notifications : receives
```

## 4. Design decisions applied

| Ref | Decision | Where enforced |
|---|---|---|
| C-04 / D-012 | `claim_origin` separate from `lifecycle_status`; plus `state_kind` (as_is / to_be / policy) | `knowledge_records`, `private.knowledge_guard` |
| C-05 | Assignment status (invited…completed) separate from session status (in_progress…closed) | `interview_assignments`, `interview_sessions` |
| C-06 | Review steps come from a configurable, versioned route; process uses `active`, documents use `published` | `approval_routes`, `approval_route_steps` |
| D-011 | Provider may receive data only up to its approved classification; training-allowed providers capped at `public` | `ai_provider_policies`, `private.ai_run_guard` |
| AC-01 | Answers append-only; corrections are linked revisions with a reason | `interview_answers` triggers |
| AC-07/08 | Publish only when every route step is approved for the current content hash; published versions frozen | `private.document_version_guard`, `private.approval_decision_guard` |
