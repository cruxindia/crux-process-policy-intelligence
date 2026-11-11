# End-to-End Functional Module Specification

This document translates the PRD into implementable modules, user behaviour and module acceptance criteria. Implement in the dependency order in the roadmap; do not attempt all modules at once.

## Module 1 — Company and organisation setup

**Purpose:** Establish the company context, departments, locations, memberships and accountable owners.

**Screens:** company setup; department tree; location tree; employee/member list; invitation flow; role assignment; configuration history.

**Key behaviour:**
- Admin creates company and confirms timezone, classification defaults and policy settings.
- Admin creates departments and optional parent-child structure.
- Admin creates/invites members and assigns department memberships.
- A member may hold multiple roles and department scopes.
- All setup changes are audited.

**Acceptance:** duplicate department code is rejected in the same company; a member from another company cannot be added by ID without authorised flow; changing a job title does not change permissions.

## Module 2 — Company DNA, VOC and CTQ discovery

**Purpose:** Understand what CRUX exists to achieve, whom it serves and what quality means.

**Discovery domains:**
- legal/entity and operating context (validated separately);
- history and evolution, business model, service lines and value proposition;
- mission, vision, purpose, strategic objectives and operating principles;
- customer and stakeholder groups;
- customer needs, expectations, complaints, feedback and promises (VOC);
- critical-to-quality characteristics (CTQ);
- business outcomes, constraints, differentiators and risk appetite;
- management decisions and source documents.

**VOC data:** source, customer segment, journey stage, need/expectation, evidence, date, frequency/severity where measured, owner and status.

**CTQ data:** related VOC, characteristic, operational definition, measurement unit, calculation method, data source, target/threshold, frequency, owner and review date.

**Acceptance:** AI may suggest themes and possible CTQs, but approved Company DNA/VOC/CTQ statements require a named human owner and review. Each approved CTQ has an operational definition and data source or is explicitly marked as not yet measurable.

## Module 3 — Department discovery

**Purpose:** Create a reliable functional profile for each department.

**Capture:** department purpose, mandate, services, internal/external customers, inputs, outputs, key roles, systems, policies, reports, metrics, recurring decisions, dependencies, pain points, key risks and improvement ideas.

**Outputs:** department profile, function/service catalogue, stakeholder map, candidate process list, missing-information list and cross-department interface list.

**Acceptance:** department head can review and correct the profile; each material statement retains source; unconfirmed statements remain draft.

## Module 4 — Interview campaign and adaptive interview engine

**Purpose:** Gather structured knowledge without forcing respondents through an inflexible long questionnaire.

**Campaign configuration:** audience, scope, target departments/processes, interview template, question set/version, start/end dates, owners, reminder rules and success criteria.

**Session features:** invitation, secure sign-in, introduction/privacy notice, progress, autosave, resume, skip/not-applicable/unknown, evidence attachment, review summary, submit and reopen-for-clarification.

**Question lifecycle:**
1. Determine objective and expected fields.
2. Load authorised prior knowledge and source summaries.
3. Identify confirmed, missing, stale and disputed fields.
4. Select next question based on gaps, branch conditions and impact.
5. Ask one clear question at a time where possible.
6. Ask follow-up for ambiguity, quantification, examples, exceptions or ownership.
7. Capture answer and source.
8. Summarise back to respondent for confirmation.
9. Submit for review.

**Question-generation constraints:** no repetitive questioning; no leading questions; no fabricated examples presented as company practice; no inference that a skipped answer means "no"; no forced numeric answer where unknown; ask who can answer when respondent lacks knowledge.

**Acceptance:** resume retains answers; generated question is stored with reason/template/model version; respondent can correct through a revision; system can show which fields remain incomplete.

## Module 5 — Process and policy intelligence

**Purpose:** Convert interview contributions into structured process/policy information.

**Process record:** name, purpose, owner, trigger, scope, customer, inputs, outputs, start/end, steps, actors, systems, decisions, timing, handoffs, dependencies, exceptions, controls, metrics and records.

**Policy record:** objective, scope, definitions, mandatory/prohibited rules, exceptions, authority, owner, effective/review date and linked processes.

**AI tasks:** extract fields; identify missing data; identify ambiguous terms; detect likely duplicate processes; identify handoffs; compare department descriptions; draft RACI; suggest process questions; identify potential risks. Every result must link to sources and mark inference versus direct statement.

**Acceptance:** AI output is editable draft; process owners can accept/reject individual fields; source answer remains unchanged; AS-IS and TO-BE never share an ambiguous status.

## Module 6 — Shared knowledge repository

**Purpose:** Provide a trusted, searchable company knowledge layer.

**Knowledge lifecycle:** suggested/submitted → review → verified (where required) → approved (where required) → superseded/retired. Disputed and rejected are explicit alternative states.

**Knowledge record fields:** type, statement, scope, owner, origin, source links, confidence, status, review history, timestamps, version and relationships.

**Views:** by company, department, process, policy, customer theme, risk, system, role, status and source.

**Acceptance:** users can open a knowledge claim and see its source chain; permission filters apply to results and source previews; stale records are flagged.

## Module 7 — Cross-department clarification and dispute resolution

**Purpose:** Surface and resolve missing information and conflicting accounts.

**Clarification flow:** create request → assign accountable responder → due date/reminders → response with source → requester review → resolved or escalated.

**Dispute flow:** identify incompatible claims → preserve all positions → link evidence → identify impact → assign decision owner → obtain positions → record decision and rationale → revise knowledge/process/document through controlled workflow.

**AI can:** flag a possible conflict, explain why claims differ, suggest questions and summarise positions.

**AI cannot:** decide which employee is truthful, erase a position, silently change approved policy or close a material dispute without authorised human decision.

**Acceptance:** both claims and their source chains remain visible; decision authority is explicit; closing a dispute records outcome and rationale; affected documents are flagged for review.

## Module 8 — Process mapping

**Purpose:** Provide usable visual representation of validated process flows.

**Required nodes:** start/end, activity, decision, handoff, system, document/record, wait/queue, subprocess, exception/escalation and control checkpoint.

**Required attributes:** node ID, label, description, responsible role/department, inputs/outputs, system, timing, linked source records, risk/control links and confidence/review status.

**Diagram functions:** create draft from structured steps; arrange swimlanes; edit/reorder; connect decisions with labelled branches; flag orphan nodes and broken paths; compare versions; export image/PDF and structured JSON; link back to source data.

**Acceptance:** map changes create a new draft/version; map does not become approved merely because it renders; every critical node has ownership or an open gap marker.

## Module 9 — Risk, control and compliance support

**Purpose:** Identify and manage risks attached to a process or policy.

**Risk capture:** risk event, causes, consequences, category, inherent likelihood/impact, existing controls, residual assessment, risk owner, treatment, due date and evidence.

**Control capture:** objective, type (preventive/detective/corrective), owner, frequency, performer, evidence, system, test method and status.

**Compliance research:** jurisdiction, entity/activity facts, candidate requirement, source, provision, dates, applicability rationale and reviewer.

**Acceptance:** risk ratings follow a documented method/version; AI suggestions are labelled; regulatory applicability cannot be marked confirmed without authorised qualified review.

## Module 10 — Document generation and governance

**Purpose:** Turn validated process and policy knowledge into controlled company documents.

**Document types:** policy, SOP, process manual, work instruction, checklist, form, RACI, control matrix, training material and operating standard.

**Document generation:** choose approved source records; select template; generate draft; list included sources; identify unresolved gaps and assumptions; allow section edits; run quality checks; submit for review.

**Approval workflow:** configurable sequential/parallel steps; role- or person-based approvers; quorum/required approvals; delegation; comments; rejection; changes requested; resubmission; approval decision and rationale.

**Publication:** lock approved version; assign version/effective/review dates; publish to authorised audience; issue notifications; collect acknowledgements; retain previous versions; support withdrawal and emergency change.

**Acceptance:** draft cannot be presented as active policy; publish endpoint checks approvals server-side; published version cannot be overwritten; new changes create new version and impact record.

## Module 11 — Task, notification and escalation engine

**Task fields:** type, linked entity, requester, assignee, priority, due date, status, instructions, source context and resolution.

**Notifications:** in-app first; email integration optional. Events include assignment, due-soon, overdue, response, approval, rejection, publication, acknowledgement and review date.

**Controls:** configurable reminders, escalation steps, timezone handling, duplicate suppression, retry and delivery status.

**Acceptance:** notification delivery failure does not erase task; retries do not create duplicate tasks; assignee access is validated.

## Module 12 — Dashboards and continuous improvement

**Dashboard types:** executive, department head, process owner, reviewer, administrator.

**Candidate metrics:** discovery coverage, interview completion, source/evidence coverage, process completeness, open/aged clarifications, disputes by severity/age, overdue reviews, approval cycle time, risks by status, control tests, document acknowledgement and improvement outcomes.

**Improvement lifecycle:** idea → screening → impact assessment → approval → trial/pilot → outcome measurement → adopt/reject/defer → process/document change if adopted.

**Acceptance:** metrics have documented definitions and source queries; filters respect user scope; dashboard does not expose restricted department or employee data.

## Module 13 — Search, export and audit

- Search structured records and documents with permission checks.
- Export only authorised content and include export audit event.
- Evidence pack should include source list, relevant versions, approval trail and generation timestamp.
- Record sensitive changes, access and state transitions.
- Provide administrative audit review without granting business approval rights.

## Recommended build order

Build Modules 1, 4 (simple interview), 5 (single-process extraction), 6 (provenance), 7 (one clarification path), 8 (basic map), 10 (one SOP approval path) and a minimum dashboard as one MVP vertical slice. Add broader company DNA, risk/legal and advanced analytics in staged releases after the base workflow is tested.
