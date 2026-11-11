# CRUX Process & Policy Intelligence Platform
## Complete project handover and build pack

**Pack status:** Version 1.0 — consolidated planning baseline, not a claim that the application has been implemented or production-validated.

This folder contains the project definition, architecture, functional design, data/security requirements, implementation roadmap, decision log and the master Claude prompt. It is intended to be placed at the root of the development repository or supplied to Claude as project knowledge.

## Read in this order

1. `00_GOVERNANCE/PROJECT_CHARTER_AND_SCOPE.md` — purpose, outcomes, boundaries and principles.
2. `01_PRODUCT/MASTER_PRD.md` — full product requirements and user journeys.
3. `02_ARCHITECTURE/SYSTEM_ARCHITECTURE.md` — proposed technical design and integration boundaries.
4. `02_ARCHITECTURE/ARCHITECTURE_DECISION_REGISTER.md` — decisions, assumptions and choices still open.
5. `03_DATA_AND_SECURITY/DATA_MODEL_BLUEPRINT.md` — entities, relationships, lifecycle and data integrity requirements.
6. `03_DATA_AND_SECURITY/ROLES_PERMISSIONS_SECURITY.md` — access model and security baseline.
7. `04_FUNCTIONAL_DESIGN/END_TO_END_MODULE_SPECIFICATION.md` — detailed module-by-module behaviour.
8. `05_AI_AND_KNOWLEDGE/AI_PROVIDER_AND_ORCHESTRATION_STRATEGY.md` — local/free-first AI, provider adapter and orchestration.
9. `05_AI_AND_KNOWLEDGE/INTERVIEW_KNOWLEDGE_AND_PROVENANCE.md` — adaptive interviews, evidence and trusted knowledge.
10. `06_GOVERNANCE_WORKFLOWS/DOCUMENT_APPROVAL_AND_CHANGE_GOVERNANCE.md` — controlled documents, approvals and continuous improvement.
11. `06_GOVERNANCE_WORKFLOWS/RISK_LEGAL_AND_COMPLIANCE_GUARDRAILS.md` — risk and legal validation controls.
12. `07_DELIVERY/IMPLEMENTATION_ROADMAP_AND_ACCEPTANCE.md` — dependency-ordered delivery plan and exit criteria.
13. `07_DELIVERY/TESTING_DEPLOYMENT_AND_OPERATIONS.md` — quality, security testing and deployment.
14. `00_GOVERNANCE/PROGRESS_AND_DECISION_LOG.md` — current known status; update this after each sprint.
15. `07_DELIVERY/MASTER_CLAUDE_BUILD_PROMPT.md` — the detailed prompt to give Claude.
16. `07_DELIVERY/DAILY_15_MINUTE_SPRINT_PROMPT.md` — reusable prompt to continue one focused sprint at a time.

## How to use this pack

- Copy this whole folder into the project repository, ideally without renaming the documents.
- Give Claude the **entire folder as project knowledge** if the environment supports it. If not, first provide `README_START_HERE.md`, `MASTER_CLAUDE_BUILD_PROMPT.md`, `MASTER_PRD.md`, `SYSTEM_ARCHITECTURE.md`, `DATA_MODEL_BLUEPRINT.md` and `IMPLEMENTATION_ROADMAP_AND_ACCEPTANCE.md`; then provide the remaining documents as needed.
- Ask Claude to perform a repository and document audit before changing code. Existing working code must be inspected and preserved.
- Ask Claude to update `PROGRESS_AND_DECISION_LOG.md` at the end of each work session.
- Do not treat generated documents, AI answers or proposed database migrations as approved company policy or production-ready software without the relevant human review and tests.

## Current implementation status

The requirements and architecture have been consolidated from the planning discussion. Earlier messages proposed a PRD, architecture and starter database design, but no repository, saved file or successful database migration has been verified in this conversation. Therefore, the project status is **planning baseline prepared; implementation evidence pending**. Claude must inspect the actual repository and replace this status only when it can point to real files, tests or deployed components.

## Important working rule

The platform is a system for **discovering, structuring, challenging, validating, approving and improving** company knowledge. It must never silently turn an AI inference or an employee's unverified statement into an approved company fact.
