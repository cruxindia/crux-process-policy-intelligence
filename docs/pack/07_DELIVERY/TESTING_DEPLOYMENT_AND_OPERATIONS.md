# Testing, Deployment and Operations Plan

## 1. Quality strategy

Test the platform at multiple levels. A screen rendering successfully is not proof that the feature works.

### Unit tests
- Validation schemas and business rules.
- Permission evaluation and scope matching.
- Lifecycle/state transition rules.
- AI output parsers and source ID validation.
- SLA/date and timezone calculations.
- Document version and approval rules.

### Integration tests
- API + database transactions.
- Authentication and membership lookups.
- RLS and backend authorisation.
- File upload/download and signed URLs.
- Worker enqueue/retry/idempotency.
- AI provider adapter and schema validation.
- Notification persistence and retry.

### End-to-end tests
- User onboarding and interview invitation.
- Interview start, autosave, resume, submit and review.
- Evidence upload and authorised retrieval.
- Knowledge draft, dispute, review and approval.
- Cross-department clarification and escalation.
- Process map generation and revision.
- SOP generation, approval, publication and acknowledgement.
- Change request and supersession.

### Security tests
- Cross-company access attempts.
- Cross-department restricted record access.
- Role escalation and changed IDs.
- Expired/revoked invitation and delegation.
- Private file path guessing.
- API key/service-role leakage.
- Prompt injection in uploaded documents and retrieved text.
- Malicious file type and oversized upload.
- Rate limiting and abuse.
- Export permissions and audit log.

### AI evaluation
- Source attribution accuracy.
- Unsupported-claim rate.
- Omission rate for steps, roles, exceptions and controls.
- Contradiction precision/recall.
- Question usefulness and repetition rate.
- Structured output validity.
- Sensitivity leakage across scopes.
- Model/provider regression tests.

## 2. Synthetic seed data

Create fictional company, departments, users, processes and documents. Label all seed data `SYNTHETIC TEST DATA`. Never use actual client or employee information in public demo fixtures.

Include at least two synthetic companies to test tenant separation, and at least three departments in one company to test cross-functional access and process participation.

## 3. Environments

- **Local:** developer machine; local or disposable database; synthetic data.
- **Development:** shared team environment; no production secrets/data.
- **Staging/pilot:** production-like configuration; limited approved data and users; tested backups.
- **Production:** separate credentials, strict access, monitoring, backup, recovery and change control.

Do not share database credentials or provider keys across environments.

## 4. CI/CD baseline

- Version control with reviewed branches/pull requests.
- Lint, type check, unit tests and build on each change.
- Migration validation against a clean database.
- Dependency and secret scanning.
- Environment-specific secrets in platform secret store.
- Deploy to staging before production.
- Production migrations have review and backup/rollback plan.
- Record release version and change summary.

## 5. Backup and recovery

Define and test:
- database backup frequency and retention;
- file/object storage backup or replication;
- point-in-time recovery availability if supported by selected plan;
- recovery point objective (maximum acceptable data loss);
- recovery time objective (maximum acceptable downtime);
- restore procedure and responsible owner;
- annual/periodic restore drill;
- backup encryption and access control.

Do not assume a provider's default backup capability is sufficient. Confirm actual plan and configuration.

## 6. Monitoring and operations

Monitor:
- API availability and error rates;
- database saturation and slow queries;
- queue depth, retry count and dead letters;
- AI provider failure, latency, usage and cost/quota;
- document generation and notification failures;
- authentication anomalies;
- storage growth and upload failures;
- audit-log write failures.

Use correlation IDs to link a user action, API request, background task and AI run. Avoid logging passwords, tokens, secrets, full confidential content or unnecessary personal information.

## 7. Incident response

Define internal contacts and procedures for:
- suspected account compromise;
- unauthorised data exposure;
- API key compromise;
- evidence/document leakage;
- harmful or incorrect AI-generated content;
- data corruption or accidental deletion;
- provider outage or quota exhaustion.

Response should include containment, preservation of audit evidence, impact assessment, notification/escalation as required, recovery, corrective action and post-incident review. Legal/contractual notification duties require qualified review.

## 8. User acceptance testing

Use representative department heads, process owners, employees, reviewers and approvers. Provide test scripts and capture defects separately from change requests. Require explicit acceptance of:
- clarity and ease of interview;
- correctness of process extraction;
- usability of source/evidence traceability;
- fairness and usability of dispute process;
- readability of maps/documents;
- approval and version behaviour;
- dashboard usefulness;
- access boundaries.

## 9. Launch checklist

- Approved pilot scope and data categories.
- Approved user/role/permission matrix.
- RLS and backend policy tests pass.
- Privacy/retention/external AI review completed.
- Database migrations reviewed and tested.
- Backup and restore tested.
- Monitoring and incident contacts ready.
- AI providers and data classes approved.
- Legal/compliance workflows clearly labelled as support, not legal advice.
- Templates and approval routes authorised.
- User training and operating instructions ready.
- Known limitations and support process published.
