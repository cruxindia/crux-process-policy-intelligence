# Roles, Permissions and Security Requirements

## 1. Core rule

Access is granted by an explicit role/permission assignment within a defined scope. A user's job title, department membership or knowledge of a URL does not grant access automatically.

## 2. Suggested roles (configurable)

| Role | Typical access purpose | Not automatically allowed |
|---|---|---|
| Platform Super Administrator | Technical configuration and support | Unrestricted reading of confidential business content unless explicitly authorised and audited |
| Company Administrator | Company setup, memberships, department and role administration | Approving all policies by virtue of admin status |
| Executive Viewer | Enterprise dashboards and assigned decisions | Editing source answers or bypassing approvals |
| Department Head | Department discovery, process review, team assignment | Viewing unrelated restricted departments by default |
| Process Owner | Assigned process lifecycle and change management | Publishing without configured approval |
| Interview Participant | Own assigned sessions, answers and tasks | Access to other employees' interviews by default |
| Subject Matter Expert | Assigned process/knowledge contributions | Company-wide administrator rights |
| Business Excellence Reviewer | Review completeness, process structure and cross-functional quality | Overriding functional/legal decisions outside delegation |
| HR Reviewer | HR-scoped content and approvals | General access to all confidential records |
| Finance Reviewer | Finance-scoped content and approvals | Unrelated employee or client data |
| Legal/Compliance Reviewer | Assigned legal, regulatory, contract and compliance review | Issuing final legal advice without professional authority |
| Document Approver | Approve specified document categories/scopes | Approve outside delegated authority |
| Auditor | Read approved/assigned evidence and audit history | Modify source evidence or operational records |
| Read-only User | View assigned published content | Create, edit, approve or export unless granted |

## 3. Permission vocabulary

Use granular permissions such as:

- `company.view`, `company.manage`
- `membership.view`, `membership.invite`, `membership.suspend`, `membership.manage_roles`
- `department.view`, `department.create`, `department.edit`, `department.archive`
- `process.view`, `process.create`, `process.edit_draft`, `process.assign_owner`, `process.submit_review`, `process.approve`, `process.publish`, `process.retire`
- `interview.view_own`, `interview.view_department`, `interview.assign`, `interview.submit`, `interview.review`
- `answer.submit`, `answer.correct_own`, `answer.review`, `answer.verify`
- `evidence.upload`, `evidence.view`, `evidence.review`, `evidence.download`, `evidence.delete_pending`
- `knowledge.view`, `knowledge.propose`, `knowledge.edit_draft`, `knowledge.verify`, `knowledge.approve`, `knowledge.dispute`, `knowledge.supersede`
- `clarification.create`, `clarification.respond`, `clarification.assign`, `clarification.resolve`, `clarification.escalate`
- `risk.view`, `risk.create`, `risk.assess`, `control.test`, `compliance.review`
- `document.create_draft`, `document.review`, `document.approve`, `document.publish`, `document.withdraw`, `document.acknowledge`
- `audit.view`, `report.export`, `platform.configure`

Permission keys are illustrative; final naming should be consistent and machine-checkable.

## 4. Scope model

A permission assignment should support one or more scope dimensions:

- company;
- business entity;
- department and descendant departments;
- location/zone/branch;
- process or process group;
- document category/classification;
- assigned task/session;
- time range;
- delegation source and reason.

A scope must be explicit. Avoid implicit "all departments" access unless the role is intentionally enterprise-wide and approved.

## 5. Separation of duties

- A contributor should not be the sole verifier and approver of their own high-impact submission where separation is required.
- A document author is not automatically the document approver.
- Legal applicability confirmation must be made by an authorised qualified reviewer, not by the model or ordinary admin.
- Risk acceptance authority must be configured by risk category/severity.
- Technical administrator privileges must not silently confer business approval rights.
- Emergency publication/override must require defined authority, rationale and retrospective review.

## 6. Security controls

### Authentication
- Use a supported identity provider and secure session handling.
- Enforce MFA for privileged roles where the selected platform supports it.
- Invitation links must be time-limited, single-use or safely revocable.
- Protect against account enumeration and insecure password recovery.
- Deactivate memberships without deleting historical authorship.

### Authorisation
- Enforce object-level permissions in backend and database RLS.
- Deny by default.
- Apply tenant filter to every query and background job.
- Test horizontal privilege escalation by changing record IDs and company IDs.
- Do not rely on hiding buttons in the UI.

### Secrets and AI credentials
- Store API keys only in server-side environment secrets or a secret manager.
- Never send service-role keys, provider keys or database credentials to browser code or client logs.
- Rotate compromised keys and maintain provider-specific keys separately.
- Restrict hosted AI providers by data classification and approved purpose.

### Evidence and storage
- Use private buckets/containers.
- Authorise every download; use short-lived signed URLs where needed.
- Validate file size, type and extension; consider malware scanning.
- Store file hash and metadata.
- Prevent path traversal and public bucket exposure.
- Log sensitive evidence access/download where appropriate.

### Application security
- Validate input server-side.
- Protect against injection, XSS, CSRF as relevant, SSRF, insecure direct object references, mass assignment and unsafe file uploads.
- Rate-limit login, invitation, AI and upload operations.
- Use secure headers and TLS.
- Keep dependencies patched and scan the repository.
- Avoid unsafe HTML rendering of AI output.

### AI-specific security
- Treat all employee-provided files, prompts and retrieved content as untrusted data, not instructions.
- Defend against prompt injection in documents and external sources.
- Do not allow retrieved content to override system policy or access rules.
- Minimise context sent to models.
- Redact or avoid sensitive data where possible.
- Validate structured output against schemas.
- Do not permit models to execute SQL, shell commands, external actions or privileged tools without narrow server-side controls and explicit human authorisation.
- Record model/version and outcome metadata; avoid storing full sensitive prompts unless needed and approved.

### Privacy and records
- Establish privacy notice, purpose limitation, data minimisation, correction, retention and deletion policies with qualified review.
- Define treatment of employee data, client data, partner data, financial information and legal records.
- Review applicable Indian privacy, employment, contractual and sector-specific obligations with qualified counsel; this document is not legal advice.

## 7. Minimum security acceptance tests

1. User from Company A cannot query Company B records by changing URL/API IDs.
2. Department member cannot access another restricted department's interview/evidence.
3. User cannot approve an item without the required scoped permission.
4. Contributor cannot bypass review by calling backend endpoints directly.
5. Removed/suspended membership loses access while attribution remains intact.
6. Expired delegation no longer works.
7. Public anonymous access to private evidence is denied.
8. Service-role credentials are absent from client bundle and browser network responses.
9. AI retrieval does not return restricted records.
10. Audit history records approval, publication, permission change and sensitive export.
11. Prompt-injection test content cannot change the agent's authorised behaviour.
12. A failed or partial approval transaction does not publish the document.

## 8. Required access-control artefacts before pilot

- Role catalogue approved by CRUX.
- Permission matrix by resource/action.
- Department/process/document scope rules.
- Approval and delegation matrix.
- Data classification and retention schedule.
- RLS policy design and tests.
- Threat model and security sign-off.
