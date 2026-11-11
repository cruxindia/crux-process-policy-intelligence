# Project Charter and Scope

## 1. Project identity

**Product name:** CRUX Process & Policy Intelligence Platform  
**Organisation context:** CRUX Risk Management Pvt. Ltd.  
**Product category:** Internal enterprise process discovery, knowledge, governance and continuous-improvement application.  
**Primary objective:** Convert distributed employee and management knowledge into a traceable, validated, controlled and continuously improving company operating system.

## 2. Problem statement

Operational processes, policies, role expectations, decision rights, controls and departmental dependencies are often distributed across employees, documents, spreadsheets, email, messaging and individual experience. This creates risks including:

- Processes being known by individuals but not documented consistently.
- Different departments describing different versions of the same workflow.
- Missing ownership, handovers, decision points, escalation paths and service levels.
- Policies or SOPs being drafted without sufficient evidence or stakeholder review.
- Unclear distinction between current practice (AS-IS), approved policy and desired future practice (TO-BE).
- No reliable link from a documented statement back to the employee, source document or decision that supports it.
- Process changes being made without impact analysis, approval, communication or version history.
- Repeated manual interviews and follow-ups by central teams.

The application should systematically discover these details, surface gaps and disagreements, and guide authorised people through resolution and controlled publication.

## 3. Product vision

A single, secure platform where every department can explain its work through guided AI interviews; the platform builds a shared company knowledge graph/repository; identifies process, control and cross-functional gaps; obtains evidence and clarification; generates maps and controlled documents; routes them through human review and approval; and tracks implementation and improvement over time.

## 4. Intended outcomes

1. Department-wise catalogue of functions, services, processes and policies.
2. Consistent process documentation with owners, inputs, outputs, steps, roles, decisions, systems, controls, exceptions, handovers and SLAs.
3. Clear distinction between AS-IS practice, TO-BE design, approved policy and evidence-backed facts.
4. Shared knowledge with source traceability and lifecycle status.
5. Visible cross-department dependencies and unresolved contradictions.
6. Risk and control register linked to the processes they affect.
7. Controlled SOP, policy, workflow, checklist and manual generation.
8. Formal review, approval, publication, acknowledgement and version history.
9. Dashboards for discovery completeness, process health, pending reviews, overdue actions, risks and improvement initiatives.
10. A repeatable mechanism for periodic reassessment and continuous improvement.

## 5. Users and stakeholder groups

The platform must support configurable organisational structures. Initial stakeholder groups include:

- Board / owners / top management.
- Managing Director / executive leadership.
- Operations leadership and operational managers.
- Department heads and functional leaders.
- Zonal, regional and branch management.
- Team leaders, executives and operational staff.
- HR and Business HR.
- Finance and Accounts.
- Business Development / Sales / Partnerships.
- Legal and Compliance.
- Quality / Business Excellence / process owners.
- Internal or external auditors, where explicitly authorised.
- Platform administrators and technical support.

The above is a starting catalogue, not an assumption that every title exists or that every person should receive access. Actual departments, names, reporting lines and delegation rules must be imported or confirmed by authorised CRUX representatives.

## 6. Scope

### In scope

- Company, entity, department, location and employee directory structures.
- Configurable roles, permissions, access scopes and delegation.
- Interview campaigns, sessions, adaptive questions, branching and resume capability.
- Discovery of company purpose, strategy, values, customer expectations, VOC and CTQ.
- Process and policy discovery, including AS-IS and TO-BE.
- Shared knowledge, source references, evidence files and provenance.
- AI-assisted summarisation, classification, gap detection and contradiction detection.
- Cross-department clarification, disputes, assigned tasks, reminders and escalation.
- Process maps and process metadata.
- Operational risk and control identification.
- Legal/regulatory applicability research support with qualified human validation.
- Controlled generation of process documents, policies, SOPs, checklists and manuals.
- Review, approval, versioning, publication, acknowledgement and withdrawal.
- Dashboards, audit trail, reporting, search and continuous-improvement workflows.
- Import/export and integration foundations, subject to security and feasibility.

### Out of scope for the initial MVP unless separately approved

- Autonomous execution of high-impact operational decisions.
- Automatic approval or publication of policies by AI.
- Legal opinions or claims of legal compliance generated without qualified review.
- Replacing the organisation's core case management, HRMS, finance or banking systems.
- Direct employee surveillance or opaque productivity scoring.
- Unrestricted ingestion of personal, client-confidential or regulated data into third-party AI services.
- A complex multi-agent architecture before a reliable single-model workflow exists.
- Custom model training before the knowledge base, permissions and evaluation datasets are mature.

## 7. Product principles

1. **Human accountability:** AI assists; authorised people own facts, decisions and approvals.
2. **Evidence first:** important claims retain their sources and limitations.
3. **No silent overwrites:** answers, facts and document versions are append-only or revision-linked.
4. **One logical knowledge source:** departments contribute to one governed repository, with access restrictions rather than disconnected silos.
5. **Least privilege:** users see and do only what their role and assignment allow.
6. **AS-IS versus TO-BE:** current practice must never be confused with a proposed improvement.
7. **Provider independence:** model providers can be changed without rewriting business logic.
8. **Free-first and reversible:** prefer open-source and genuinely free tiers, but design for migration if limits are reached.
9. **Modular delivery:** deliver useful vertical slices; avoid building every module before testing the first.
10. **Auditable change:** capture who changed, reviewed, approved, published or superseded information and when.
11. **Indian context:** legal applicability is researched against the relevant entity, geography, service, client and activity; qualified Indian legal review is mandatory before legal conclusions or publication.
12. **Accessibility and usability:** interviews should be simple, mobile-friendly and resumable.

## 8. Success measures

Baseline values must be measured during pilot; do not invent targets. Suggested KPIs:

- Percentage of departments onboarded.
- Percentage of priority processes discovered.
- Interview completion and drop-off rates.
- Percentage of process records with named owner and participating departments.
- Percentage of key statements supported by sources.
- Number and age of unresolved cross-department clarifications.
- Percentage of priority processes with reviewed maps and controls.
- Average time from first interview to approved SOP.
- Review and approval turnaround time.
- Percentage of published documents acknowledged by required users.
- Number of stale or overdue document reviews.
- Number of improvement actions completed and validated.
- User satisfaction and perceived reduction in repeated clarification work.

## 9. MVP definition

The first usable MVP should prove one complete path for a limited pilot scope:

1. Administrator creates a company, departments and users.
2. Department head starts a discovery interview.
3. Interview captures process details and evidence.
4. AI proposes structured process facts with sources and uncertainty markers.
5. Reviewer validates or disputes the proposed facts.
6. A participating department receives a clarification task.
7. Resolved facts are assembled into an AS-IS process map and draft SOP.
8. Authorised approvers review and approve a version.
9. Published document is visible to authorised users with version history.
10. Dashboard shows completion, open issues and approval state.

Do not expand the MVP until this vertical slice works reliably and securely.
