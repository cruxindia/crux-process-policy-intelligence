# Document Index

**Last updated:** 2026-11-11 · Required by MASTER_CLAUDE_BUILD_PROMPT §5. Owners are "Unassigned" until CRUX names them; Shantanu is working owner of the pack.
Status values: Not Started / Drafted / Under Review / Approved / Superseded.

## A. Files in the pack

| Path | Purpose | Owner | Status | Version | Last updated |
|---|---|---|---|---|---|
| README_START_HERE.md | Pack entry point | Unassigned | Drafted | 1.0 | 2026-11-11 |
| 00_GOVERNANCE/PROJECT_CHARTER_AND_SCOPE.md | Charter, scope, principles | Unassigned | Drafted | 1.0 | 2026-11-11 |
| 00_GOVERNANCE/STATEMENT_OF_WORK.md | Living SOW (org mandate) | Shantanu (working) | Drafted | 0.1 | 2026-11-11 |
| 00_GOVERNANCE/REPOSITORY_AUDIT.md | Phase 0 audit, coverage, conflicts | Shantanu (working) | Drafted | 0.1 | 2026-11-11 |
| 00_GOVERNANCE/REQUIREMENTS_TRACEABILITY_MATRIX.md | FR/NFR/MVP/acceptance mapping | Unassigned | Drafted | 0.1 | 2026-11-11 |
| 00_GOVERNANCE/PROGRESS_AND_DECISION_LOG.md | Verified status + decisions | Shantanu (working) | Drafted | 1.1 | 2026-11-11 |
| 00_GOVERNANCE/ASSUMPTIONS_AND_OPEN_QUESTIONS.md | Assumptions / questions | Unassigned | Drafted | 1.1 | 2026-11-11 |
| 00_GOVERNANCE/RISK_AND_DEPENDENCY_REGISTER.md | Project risks | Unassigned | Drafted | 1.1 | 2026-11-11 |
| 00_GOVERNANCE/CHANGE_LOG.md | Pack change history | Shantanu (working) | Drafted | 0.1 | 2026-11-11 |
| 00_GOVERNANCE/DOCUMENT_INDEX.md | This index | Shantanu (working) | Drafted | 0.1 | 2026-11-11 |
| 01_PRODUCT/MASTER_PRD.md | Product requirements | Unassigned | Drafted | 1.0 | 2026-11-11 |
| 02_ARCHITECTURE/SYSTEM_ARCHITECTURE.md | Proposed architecture | Unassigned | Drafted (Proposed) | 1.0 | 2026-11-11 |
| 02_ARCHITECTURE/ARCHITECTURE_DECISION_REGISTER.md | ADRs | Unassigned | Drafted | 1.0 | 2026-11-11 |
| 03_DATA_AND_SECURITY/DATA_MODEL_BLUEPRINT.md | Logical data model | Unassigned | Drafted | 1.0 | 2026-11-11 |
| 03_DATA_AND_SECURITY/ROLES_PERMISSIONS_SECURITY.md | Access model, security | Unassigned | Drafted | 1.0 | 2026-11-11 |
| 04_FUNCTIONAL_DESIGN/END_TO_END_MODULE_SPECIFICATION.md | Module behaviour | Unassigned | Drafted | 1.0 | 2026-11-11 |
| 04_FUNCTIONAL_DESIGN/DEPARTMENT_AND_PROCESS_DISCOVERY_TEMPLATES.md | Interview field templates | Unassigned | Drafted | 1.0 | 2026-11-11 |
| 05_AI_AND_KNOWLEDGE/AI_PROVIDER_AND_ORCHESTRATION_STRATEGY.md | AI adapter/orchestration | Unassigned | Drafted | 1.0 | 2026-11-11 |
| 05_AI_AND_KNOWLEDGE/INTERVIEW_KNOWLEDGE_AND_PROVENANCE.md | Interview + provenance | Unassigned | Drafted | 1.0 | 2026-11-11 |
| 06_GOVERNANCE_WORKFLOWS/DOCUMENT_APPROVAL_AND_CHANGE_GOVERNANCE.md | Controlled documents | Unassigned | Drafted | 1.0 | 2026-11-11 |
| 06_GOVERNANCE_WORKFLOWS/RISK_LEGAL_AND_COMPLIANCE_GUARDRAILS.md | Risk/legal guardrails | Unassigned | Drafted | 1.0 | 2026-11-11 |
| 07_DELIVERY/IMPLEMENTATION_ROADMAP_AND_ACCEPTANCE.md | Phases and gates | Unassigned | Drafted | 1.0 | 2026-11-11 |
| 07_DELIVERY/TESTING_DEPLOYMENT_AND_OPERATIONS.md | Test/deploy/ops | Unassigned | Drafted | 1.0 | 2026-11-11 |
| 07_DELIVERY/MASTER_CLAUDE_BUILD_PROMPT.md | Master build prompt | Shantanu | Drafted | 1.0 | 2026-11-11 |
| 07_DELIVERY/PHASE_SPECIFIC_CLAUDE_PROMPTS.md | Per-phase prompts | Shantanu | Drafted | 1.0 | 2026-11-11 |
| 07_DELIVERY/DAILY_15_MINUTE_SPRINT_PROMPT.md | Sprint prompt | Shantanu | Drafted | 1.0 | 2026-11-11 |

## A2. Repository documents (outside the pack)

| Path | Purpose | Status | Last updated |
|---|---|---|---|
| ../../README.md | Repo entry, run instructions | Drafted | 2026-11-11 |
| ../ENTITY_RELATIONSHIP_DIAGRAM.md | ERD (Master §5 required) | Implemented, not accepted | 2026-11-11 |
| ../DATABASE_SCHEMA_REFERENCE.md | Generated schema reference (Master §5 required) | Generated | 2026-11-11 |
| ../DASHBOARD_METRICS.md | MVP metric definitions (partial DASHBOARD_AND_REPORTING_SPEC) | Drafted | 2026-11-11 |

## B. Master §5 required names → where they live

| Required name | Satisfied by / plan |
|---|---|
| RISK_CONTROL_COMPLIANCE_SPEC | `06_GOVERNANCE_WORKFLOWS/RISK_LEGAL_AND_COMPLIANCE_GUARDRAILS.md` |
| DOCUMENT_GOVERNANCE_SPEC | `06_GOVERNANCE_WORKFLOWS/DOCUMENT_APPROVAL_AND_CHANGE_GOVERNANCE.md` |
| AI_PROVIDER_STRATEGY | `05_AI_AND_KNOWLEDGE/AI_PROVIDER_AND_ORCHESTRATION_STRATEGY.md` |
| IMPLEMENTATION_ROADMAP | `07_DELIVERY/IMPLEMENTATION_ROADMAP_AND_ACCEPTANCE.md` |
| AI_ORCHESTRATION_SPEC, AI_EVALUATION_PLAN | Partial in AI_PROVIDER_AND_ORCHESTRATION_STRATEGY §7–11; separate files when Phase 5 starts |
| TEST_STRATEGY, DEPLOYMENT/BACKUP/INCIDENT runbooks, USER_ACCEPTANCE_TESTS | Partial in TESTING_DEPLOYMENT_AND_OPERATIONS; separate files before pilot |
| DEPARTMENT_CATALOGUE, PROCESS_CATALOGUE, COMPANY_DNA_VOC_CTQ_FRAMEWORK | Templates exist; catalogues need real CRUX data (AQ-002, AQ-003) |
| All other required names | Not Started — see REPOSITORY_AUDIT §7 for the phase in which each is due |
