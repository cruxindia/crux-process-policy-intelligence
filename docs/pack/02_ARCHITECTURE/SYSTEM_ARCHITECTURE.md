# System Architecture

**Status:** Proposed architecture for validation; not a record of a deployed stack.

## 1. Architecture objective

Deliver a modular, secure application with one authoritative transactional database and one governed knowledge layer. AI services are replaceable components, not owners of company data. Specialist AI roles are logical capabilities orchestrated by backend workflows; they do not maintain disconnected knowledge stores.

## 2. Logical architecture

```text
Employees / Managers / Reviewers / Approvers
                    |
                    v
         Web Application (Next.js / React)
      Interview UI | Process UI | Admin | Dashboards
                    |
                    v
       Authentication + Session Management
                    |
                    v
            Backend API / Services
       Validation | Permissions | Business Rules
                    |
        +-----------+-----------+----------------+
        |           |           |                |
        v           v           v                v
   Interview    Workflow     Document         Search /
   Service      Service      Service          Reporting
        |           |           |                |
        +-----------+-----------+----------------+
                    |
                    v
             AI Orchestrator
     Prompt Registry | Provider Adapter | Guardrails
                    |
        +-----------+-------------------+
        |                               |
        v                               v
   Local Ollama                  Hosted Provider APIs
   (where practical)            (optional, approved only)
        |                               |
        +---------------+---------------+
                        |
                        v
              Shared Knowledge Services
       Retrieval | Provenance | Status | Source Access
                        |
             +----------+-----------+
             |                      |
             v                      v
       PostgreSQL              Private Object Storage
   Core records / audit        Evidence / generated files
             |
             v
     Background Job Queue / Worker
 Interviews | AI processing | reminders | exports
```

## 3. Recommended starting stack

This is a pragmatic candidate stack, not a mandatory final selection. Claude must inspect the existing repository and reuse working components where sound.

| Layer | Candidate | Rationale / caution |
|---|---|---|
| Frontend | Next.js + React + TypeScript | Common web application stack; good fit for forms and dashboards. |
| Styling | Tailwind CSS | Rapid consistent UI. |
| UI components | Accessible component library selected by repo audit | Avoid bespoke controls for every form. |
| Backend | Next.js server routes/actions or separate API service | Start simple; keep business logic server-side and separable. |
| Database | PostgreSQL | Relational integrity, transactions, JSONB where suitable. |
| Hosted DB/auth/storage candidate | Supabase | Fast prototype path; assess current limits, region, backups, pausing, RLS and production requirements. |
| Local inference | Ollama | Keeps inference local when suitable hardware/model is available; not automatically secure without endpoint controls. |
| Hosted inference | Gemini/Groq/other provider behind adapter | Optional; free quotas and terms change; require approval for data categories. |
| Process diagram | React Flow or BPMN-capable library | Interactive maps; decide whether BPMN export/conformance is required. |
| Background work | PostgreSQL-backed job queue or managed queue | Use retryable/idempotent jobs; avoid long model calls in request lifecycle. |
| File storage | Private object storage | Signed, short-lived access; malware/file validation and retention controls. |
| Observability | Structured logs and error tracking | Start with low-cost/open-source options; never log secrets or full sensitive prompts by default. |

## 4. Architecture boundaries

### Frontend
- Renders screens and collects user actions.
- Does not decide permissions.
- Does not hold provider secrets or service-role credentials.
- Calls authenticated backend endpoints.
- Shows status, source citations, uncertainty and review state.

### Backend application layer
- Enforces business rules and object-level authorisation.
- Validates all input and state transitions.
- Coordinates database transactions.
- Creates background jobs for long-running tasks.
- Returns only data the user is authorised to access.

### AI orchestration layer
- Selects task-specific model/provider and prompt version.
- Supplies only the minimum permitted context.
- Applies structured output schemas and validation.
- Separates extraction, inference, recommendation and drafting.
- Stores provider/model/version metadata and safe execution metadata.
- Never directly publishes approved knowledge or documents.

### Database
- System of record for identity references, organisational data, workflows, facts, permissions, approvals and audit metadata.
- Enforces foreign keys, unique constraints and row-level restrictions.
- Preserves source and revision history.

### Object storage
- Holds evidence and generated artefacts.
- Stores private paths and metadata in database.
- Access via authorised backend or short-lived signed URLs.
- File checks include extension/MIME validation, size limits, malware scanning where feasible, hash and retention classification.

### Worker / queue
- Processes AI calls, long interview analysis, reminders, notifications, document render and exports.
- Jobs are idempotent, observable, retryable and dead-lettered after configured failures.
- Job payloads contain record IDs, not unrestricted sensitive content where avoidable.

## 5. AI design pattern

Use one orchestrator and a set of task-specialist instructions. A specialist is a prompt/configuration plus a defined input/output schema, not necessarily a separately running autonomous agent.

Suggested task capabilities:
- Interview planner / adaptive question generator.
- Answer structurer / extractor.
- Process architect.
- Department responsibility analyst.
- Cross-functional dependency and contradiction analyst.
- Risk and control analyst.
- Legal-source research assistant (human-reviewed).
- Document drafter.
- Red-team / completeness reviewer.
- Change-impact analyst.

The orchestrator decides which capabilities to run. Each result references source record IDs and states uncertainty. Human review gates are mandatory at defined lifecycle points.

## 6. Multi-tenant and data isolation

- Every tenant-owned object carries a company/tenant ID.
- Foreign keys should prevent cross-company relationships.
- Backend access checks and database RLS must both be designed and tested.
- Never rely on a company ID submitted by the browser as proof of membership.
- Derive permitted company context from verified session/membership.
- Background workers use narrowly scoped service identities and repeat object access checks.
- Search/vector indexes must carry tenant and access metadata; filter before retrieval and re-check before response.

## 7. Deployment stages

### Local development
- Developer workstation; local PostgreSQL or isolated Supabase development project.
- Ollama only on a protected local network/interface.
- Synthetic or redacted data only.
- `.env` secrets excluded from version control.

### Pilot
- Hosted environment with TLS, controlled authentication, backups and monitoring.
- Small approved participant group.
- No sensitive production evidence until privacy, access, retention and processor terms are reviewed.
- Human review required for every published knowledge/document item.

### Production
- Security and privacy review, threat model, disaster recovery, backup restore test, incident response, access review, capacity and cost review.
- Separate development/staging/production environments.
- Database migrations tested and version-controlled.
- External AI provider use approved by data classification and contract/terms review.

## 8. Architecture quality attributes

- Security and confidentiality.
- Traceability and auditability.
- Data integrity and recoverability.
- Reliability of background workflows.
- Provider independence.
- Maintainability and testability.
- Explainability and source provenance.
- Responsive user experience.
- Cost transparency and ability to migrate away from a vendor.

## 9. Do not overbuild in MVP

Avoid initially:
- many autonomous agents communicating freely;
- microservices for every module;
- custom vector database before retrieval requirements are proven;
- event streaming platform unless scale requires it;
- fine-tuning before evaluation data exists;
- paid orchestration frameworks where simple backend code suffices.

Start as a modular monolith with clean service boundaries and background workers. Split services only when an evidenced operational or scaling need exists.
