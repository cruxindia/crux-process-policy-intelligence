# Master Product Requirements Document (PRD)

**Product:** CRUX Process & Policy Intelligence Platform  
**Document status:** Baseline requirements for validation with CRUX management and department heads.  
**Version:** 1.0

## 1. Product goal

Build a secure, multi-department application that interviews employees and management, captures processes and policies, builds a shared source-traceable knowledge repository, detects gaps and conflicts, coordinates cross-functional resolution, supports risk/control validation, generates controlled documents and manages approvals, versions and continuous improvement.

## 2. Core objects and definitions

- **Company DNA:** purpose, vision, mission, strategy, operating principles, values, business model, service promise and organisational context.
- **VOC (Voice of Customer):** customer needs, expectations, complaints, feedback, requirements and experience signals.
- **CTQ (Critical to Quality):** measurable characteristics that are critical to meeting customer or stakeholder requirements.
- **Department:** organisational function or unit with a mandate, head, members and responsibilities.
- **Process:** repeatable sequence of work that transforms inputs into outputs for an internal or external customer.
- **Policy:** approved rules, boundaries, decision rights and mandatory requirements.
- **SOP:** controlled instructions describing how a process is performed.
- **AS-IS:** observed or reported current practice, not necessarily approved or compliant.
- **TO-BE:** proposed or approved future-state design, clearly labelled by status.
- **Knowledge record:** a claim, fact, interpretation, rule, risk, dependency or decision stored with status and provenance.
- **Evidence:** source material such as approved document, form, screenshot, email, system extract, interview record or other file, subject to retention and privacy rules.
- **Clarification:** a request for a missing detail or confirmation.
- **Dispute:** a material disagreement between people, departments, documents or observed practice.
- **Controlled document:** a formal policy, SOP, manual, checklist, template or work instruction with owner, version, review and approval history.

## 3. Personas and key jobs

### 3.1 Platform administrator
- Configure company, organisational structure, authentication and global settings.
- Assign roles and access scopes.
- Configure interview templates, AI providers and system settings.
- View platform health and audit events, subject to privacy boundaries.

### 3.2 Company executive / Board-authorised viewer
- View enterprise-level discovery, risks, decisions and approval status.
- Review and approve only those items assigned under the delegation matrix.
- Monitor overdue or disputed matters.

### 3.3 Department head
- Define department mandate, services, customers and key processes.
- Invite or assign team members to interviews.
- Review department knowledge and process drafts.
- Resolve or delegate interdepartmental clarifications.
- Nominate process owners and approvers.

### 3.4 Process owner
- Maintain an assigned process from discovery through approval and review.
- Validate steps, roles, inputs, outputs, controls, SLAs and exceptions.
- Manage change requests and periodic reviews.

### 3.5 Employee / subject-matter expert
- Complete interview sessions and submit explanations or evidence.
- Correct or clarify their own submissions through linked revisions.
- Respond to clarification tasks.
- See their contribution history and permitted process information.

### 3.6 Reviewer / Business Excellence
- Assess completeness, consistency, evidence and process quality.
- Challenge unsupported assumptions.
- Coordinate cross-department review.
- Prepare documents for approval.

### 3.7 HR, Finance, Legal, Compliance and other specialist reviewers
- Review content within their function and delegated scope.
- Identify function-specific obligations, risks and control requirements.
- Provide comments and evidence without silently changing another function's source statement.

### 3.8 Auditor
- Read approved records, relevant source evidence and audit logs according to assigned scope.
- Export evidence packs where authorised.
- Cannot change source records or approve documents unless separately delegated.

## 4. Functional requirements

### FR-01 Identity and organisation
- Support a company with configurable business units, departments, sub-departments, locations and memberships.
- A user may have more than one department membership or role.
- Job title must not itself grant permissions.
- Support inactive, suspended and removed memberships without deleting historical attribution.
- Support future multi-entity or multi-tenant separation.

### FR-02 Role and permission management
- Permissions must be granular and action-based: view, create, submit, edit draft, assign, comment, verify, dispute, approve, publish, retire, export and administer.
- Access may be scoped by company, department, process, location, document classification or assignment.
- Approval authority must be configurable and separate from general editing access.
- Support temporary delegation with start/end dates and audit trail.

### FR-03 Department and function discovery
- Capture department purpose, mandate, services, internal/external customers, inputs, outputs, systems, policies, measures, key roles and interfaces.
- Identify overlapping or unclear responsibilities.
- Record accountable owner and review date.

### FR-04 Company DNA, VOC and CTQ
- Conduct structured discovery of organisational context, strategy, values, customer segments, service promises and business priorities.
- Capture VOC from identified sources, with source date and applicability.
- Translate VOC into CTQ candidates with definition, measurement method, target/threshold, owner and data source.
- Keep AI-proposed themes separate from management-approved statements.

### FR-05 Interview campaigns and sessions
- Create interview campaigns for company, department, role, process, policy or specific clarification.
- Support invitation links with secure authentication or approved invitation tokens.
- Save progress and allow resumption.
- Support autosave, session status and completion summary.
- Capture respondent, role, department, process context, timestamps and consent/notice where required.
- Support text, selection, numeric, date, file and structured answers where justified.

### FR-06 Adaptive question engine
- Select questions based on interview type, known context, answer content, missing fields, confidence and contradictions.
- Ask follow-up questions to resolve ambiguity, quantify vague statements and identify exceptions.
- Avoid repeated questions when a sufficiently reliable answer already exists; show prior source and ask for confirmation when appropriate.
- Record question template/version, generated question, reason, expected information and model provenance.
- Offer "I don't know", "not applicable", "depends" and "needs another owner" paths.
- Do not force an employee to invent answers.
- Permit interviewer/reviewer override and manual questions.

### FR-07 Process discovery
For each process capture, as applicable:
- process name, code, purpose, trigger, scope and owner;
- customer and expected output;
- inputs, prerequisites and source systems;
- start and end events;
- ordered activities, actor/role, system/tool, decision and condition;
- handoffs, queues, wait time and dependencies;
- SLA/TAT, frequency, volume and quality measures;
- exceptions, rework, failure modes and escalation;
- approvals, authority limits and segregation of duties;
- records generated and retention needs;
- risks, controls and evidence;
- upstream/downstream processes;
- AS-IS confidence and TO-BE proposals.

### FR-08 Policy discovery
- Capture policy intent, scope, definitions, rules, mandatory/prohibited actions, exceptions, decision rights, owner, effective date, review date and linked processes.
- Identify policy conflicts and operational deviations.
- A discovered practice is not automatically a policy.

### FR-09 Shared knowledge and source provenance
- Store structured knowledge records with type, content, origin, lifecycle status, owner, timestamps and applicable scope.
- Link every material knowledge claim to one or more source records or explicitly label it as an unsubstantiated hypothesis.
- Preserve exact employee answers and evidence references.
- Record AI provider, model, prompt/template version and processing timestamp for AI-generated results.
- Track confidence and reviewer decision separately; confidence is not approval.
- Support disputed, superseded and rejected states.
- Maintain history; no destructive overwrite of approved knowledge.

### FR-10 Cross-department collaboration
- Identify dependencies and missing inputs/outputs between departments.
- Create clarification tasks with owner, requester, due date, priority, affected process, specific question, evidence and status.
- Support responses, comments, counter-evidence, reassignment and escalation.
- Detect disagreement without selecting a winner automatically.
- Provide structured dispute record: issue, competing claims, sources, impact, participants, proposed resolution, decision owner, decision, rationale and date.
- Support "unable to resolve" and escalation to an authorised executive.

### FR-11 Process mapping
- Generate a draft flow from validated process structure.
- Support start/end, activity, decision, system, document, handoff, subprocess, wait and exception nodes.
- Display department swimlanes and role ownership.
- Link nodes to source answers, knowledge records, controls and evidence.
- Allow authorised human editing; track map version and changes.
- Export a readable diagram and structured data.
- Do not create a map from ambiguous data without marking assumptions and gaps.

### FR-12 Risk and control management
- Identify operational, service, financial, information-security, people, third-party, customer and regulatory risk categories where relevant.
- Record risk event, cause, impact, inherent likelihood/severity, existing controls, control owner, residual assessment, action and review date.
- Identify preventive, detective and corrective controls.
- Map controls to process steps, policy clauses and evidence.
- Distinguish AI-identified risks from reviewed/accepted risks.

### FR-13 Legal and regulatory applicability support
- Capture jurisdiction, entity type, activity, service, location, customer type, relevant threshold/date and source citation.
- Research candidate legal obligations using current authoritative sources where available.
- Track source title, issuing authority, provision, URL or document reference, publication/effective dates, retrieval date and applicability rationale.
- Mark each item as candidate, under legal review, confirmed applicable, not applicable with rationale, superseded or unknown.
- Require qualified Indian legal/compliance review before a legal conclusion is relied on or a controlled policy is published.
- Do not represent AI output as legal advice or guarantee of compliance.

### FR-14 Document generation and governance
- Generate drafts from approved or review-ready structured data, not from unrestricted conversation summaries alone.
- Support policy, SOP, process manual, checklist, form, work instruction, RACI, control matrix and training/acknowledgement material.
- Include document owner, classification, version, status, approvers, effective date, review date, change summary and linked source records.
- Support review comments, requested changes, approval/rejection and publication.
- Maintain immutable published versions and supersession links.
- Support withdrawal, retirement and emergency change workflow.
- Publish only after required approvals are complete.

### FR-15 Notifications and reminders
- Notify users about invitations, due interviews, clarification requests, review tasks, approvals, overdue items and upcoming reviews.
- Support in-app notification first; email integration can be added later.
- Configure reminder frequency and escalation; prevent noisy duplicate notifications.
- Record delivery state and task state separately.

### FR-16 Dashboards and reporting
- Enterprise and department views with appropriate access restrictions.
- Show discovery progress, process coverage, evidence completeness, open clarifications, disputes, overdue tasks, approval pipeline, document review dates, risk/control status and improvement actions.
- Allow filtering by department, process, location, owner, status, priority and date.
- Provide exports with permission checks and audit events.

### FR-17 Search and retrieval
- Search departments, processes, knowledge, documents and evidence metadata according to permissions.
- Provide filters and source-aware result summaries.
- Future semantic/vector retrieval must apply the same access restrictions before returning content.
- Search snippets must not leak restricted data.

### FR-18 Continuous improvement
- Capture improvement idea, evidence/problem, expected benefit, impact, owner, approval, pilot, result and decision.
- Link improvement to process versions, risks, controls, CTQs and VOC themes.
- Compare before/after metrics when available.
- Retain rejected and deferred ideas with rationale.

### FR-19 Audit and history
- Record sensitive actions and state transitions with actor, timestamp, object, old/new values or change summary, reason and correlation/request ID.
- Audit logs must be protected from ordinary modification/deletion.
- Record AI calls and human review events without unnecessarily retaining sensitive prompt payloads.

## 5. Non-functional requirements

- Secure by default; deny access unless explicitly authorised.
- Multi-tenant-safe data model even if first deployment is single-company.
- Responsive mobile and desktop interface.
- Accessible forms, clear error handling and autosave.
- Reliable resume for long interviews.
- Idempotent background jobs and retry handling.
- Data export, backup and restore plan.
- Configurable retention and deletion rules.
- Provider-independent AI integration.
- Observability for application errors, job failures, model latency and spend/usage.
- Explainable outputs: sources, assumptions and unresolved gaps visible.
- Performance targets to be measured and agreed in technical design; do not claim them until tested.

## 6. Main user journeys

### Journey A — Department onboarding
1. Administrator sets up department and department head.
2. Department head receives invitation and reviews purpose/notice.
3. Guided discovery interviews capture mandate, services, customers, roles, systems and interfaces.
4. AI creates draft department profile and missing-information list.
5. Department head and designated reviewer validate it.
6. Approved profile becomes available to authorised process discovery.

### Journey B — Process discovery
1. User selects department and process or creates a candidate.
2. AI explains scope and asks adaptive questions.
3. User describes trigger, steps, roles, decisions, handoffs, systems, SLAs and exceptions.
4. User attaches evidence or identifies where evidence resides.
5. AI structures answers and identifies gaps; original wording remains retrievable.
6. Process owner validates and invites participating departments.
7. Clarifications and disputes are resolved or escalated.
8. Draft AS-IS map and SOP are generated with sources and assumptions.

### Journey C — Contradiction resolution
1. Platform detects two incompatible statements about the same process condition.
2. It records both claims and sources without overwriting.
3. It opens a clarification/dispute with impacted owners.
4. Participants provide evidence and explanations.
5. Authorised decision owner records outcome and rationale.
6. Knowledge status and affected process/document drafts are updated through traceable revisions.

### Journey D — Controlled document publication
1. Process owner requests an SOP draft.
2. Document engine assembles only eligible records and clearly flags open gaps.
3. Reviewers comment or request changes.
4. Required approvals are collected according to the configured matrix.
5. Published version is locked and assigned effective/review dates.
6. Required users are notified and acknowledgement is tracked.

### Journey E — Continuous improvement
1. User submits issue or improvement opportunity.
2. Platform links it to process, VOC/CTQ, risk and evidence.
3. Owner evaluates impact and obtains approval for pilot/change.
4. New process/document version is reviewed and published.
5. Outcome is measured and recorded; prior version remains available.

## 7. Acceptance principles

A feature is not complete merely because a screen exists. It must have:
- working data persistence;
- permission enforcement on the server/database, not only the UI;
- validation and error states;
- audit/history where material;
- tests for normal, invalid and unauthorised paths;
- accessible user feedback;
- documented limitations and operational instructions.
