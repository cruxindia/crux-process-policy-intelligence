# Blueprint v1.0 (9-Nov-2026) — gap analysis against what is built

**Source:** `Policy_making_sow.docx` (owner, re-sent 13-Nov-2026 as "the document of missing points") — "CRUX Process & Policy Intelligence Platform, proposed product blueprint v1.0", §1–§20, plus the master prompt (16 non-negotiable principles).
**Method:** each blueprint requirement checked against the schema (`supabase/migrations`, PPI-001…029), the web app (`web/app`), the Edge Functions and the traceability matrix. Status words: **Built** (tested), **Partial** (some of it tested), **Data only** (tables exist, no workflow/UI), **Missing**.
**Date:** 13-Nov-2026 · Owner of this file: Claude (update on every module).

## 1. Status by blueprint section

| § | Requirement | Status | Evidence / what exists | Gap |
|---|---|---|---|---|
| 2 | One structured company record; chat is not the database | **Built** | All answers, analyses, processes, flows, board turns are rows with provenance; append-only histories | — |
| 3 | Model-independent gateway; specialist agents invoked when needed; structured findings only | **Partial** | Provider adapter (Gemini, Ollama), Vault keys, routing, 26 slots; board = fixed plan, structured turns (no free AI chat) | Only Gemini usable; no Claude/OpenRouter adapter; no per-request token budget or cost log; no "economical / expert / critical review" modes |
| 4A | Company Discovery questionnaire (identity, purpose, business model, services, customers, footprint, organisation, technology, vendors, objectives, challenges, risk appetite, legal environment, future) | **Missing** | Board/MD interview not built (FR-04 deferred, D-010) | Whole module |
| 4B–C | Four voices (VOC, VOB, VOE, VOR) captured separately; CTQ with **management-approved** measures/targets; Company Operating Blueprint referenced by every interview | **Missing** | — | Whole module |
| 5 | Functional catalogue (16 functions), mandatory enterprise policy catalogue (23), department SOP lists; Mandatory / Required / Recommended / Not applicable; *missing document ≠ missing process* | **Built (M1, 13-Nov)** | PPI-030; `/catalogue`; test 22 (24 assertions); `catalogue.cjs` 17/17 | AI suggestions of new catalogue items (status *proposed*) come with M3 |
| 6A | Interview journey: participant → department → activities → processes → exceptions/risks → cross-check → validate | **Partial** | Discovery engine covers participant → activities → processes → exceptions; Review Centre shows result | "Department head validates the process" step; cross-check with other departments |
| 6B | **Three contextual suggested answers** + write own + I don't know (→ gap) + I didn't understand (→ example) + Not applicable (reason) + ask someone + save for later | **Partial** | Free text; chips "I'm not sure", "Can you explain?", "I forgot something", "Correct an earlier answer" | 3 AI suggestions from collected knowledge; N/A with reason; ask someone (→ clarification task); save for later; "don't know" → knowledge gap record |
| 6C | 20-dimension discovery framework (purpose, trigger, input, source, owner, participants, activities, decisions, systems, approvals, output, recipient, SLA, exceptions, escalation, controls, evidence, KPI, risks, improvements) | **Partial** | 10 dimensions A–J with completeness | Split to the 20 dimensions |
| 6D | Live, **editable BPMN 2.0** map: swimlanes, decisions, parallel paths, escalations, manual vs system, documents, owners | **Partial** | Live React Flow map, versioned, read-only (D-054: corrections via chat) | BPMN model + editor (bpmn-js), swimlanes, as-is / to-be versions |
| 7A | Cross-department contradiction detection between **different people/departments**; as-is / should-be / future-state | **Partial** | Contradictions within one conversation (interview_clarifications); disputes with positions + decisions (PPI-008) | Cross-session comparison; three-state process versions |
| 7B | Clarification task: ID, raised by, assigned to, original answer, question, reason, priority, due, **reminder count**, evidence, resolution, status | **Partial** | `clarification_tasks` (priority, due, escalation level, outcome) + responses; Requests page | Reason, reminder count, evidence link, "AI checks whether answered", requester confirmation loop |
| 7C | **Email** on assignment, working-day reminders 1/2/3, escalation after SLA, notify requester, one daily digest per person | **Missing** | In-app notifications only | Background worker (pg_cron) + email provider |
| 7D | Discussion thread per task; chat ≠ decision; decision recorded with owner, authority, date, evidence | **Partial** | Responses thread; `dispute_decisions` | Decision register across clarifications |
| 8 | **Four** progress indicators (interview, process completeness, cross-department validation, approval readiness); weighted checkpoints with 6 statuses; critical blockers; "why progress changed" | **Partial** | One progress % + per-process completeness | Three more indicators, checkpoint statuses, change log, blockers |
| 9 | Short sessions, autosave, resume anywhere | **Built** | Autosave + resume tested | — |
| 9 | My Pending Questions | **Built** | Requests page | — |
| 9 | "Your Answer in Action" with immediate correction | **Partial** | Acknowledgement + live panel + correct via chat | Explicit "what I understood / step added / department affected / still unclear" card with a correct button |
| 9 | Voice answers; Hindi & Marathi; milestones; team progress; improvement suggestions by employees; thank-you review | **Missing** (except summary page) | "What we understood" page | Voice, languages, milestones, suggestions |
| 10 | Next.js + Supabase + Postgres; secrets server-side | **Built** | — | — |
| 10 | pgvector retrieval; background jobs; Outlook email | **Missing** | Retrieval = direct queries | pgvector (only if needed), worker, email |
| 10C | Registers: dependency, conflict, decision, **risk, control, legal**, approval, notification, AI activity, audit | **Partial** | Conflict (disputes), decision (dispute_decisions), approval, notification, AI activity (`ai_runs`), audit | Dependency, risk, control, legal, improvement-opportunity registers |
| 10D | Five knowledge categories; never promote "proposed" to "approved" silently | **Partial** | `knowledge_records` statuses + review; board outputs need human approval | Explicit five-category view |
| 11A | Every suggestion classified: binding / contractual / industry standard / recommended | **Missing** | Board rule "recommendations labelled" | Field on every finding |
| 11B–D | Legal research engine with **official sources** (India Code, Gazette, ministries, CERT-In), applicability test, section/clause, jurisdiction, effective date, action, owner, evidence, review status | **Missing** | Board reference library of 23 laws, no section numbers asserted | Source-backed research (web-grounded), legal requirement register, qualified-review gate (AC-09) |
| 11C | DPDP Act 2023 + Rules 2025 readiness items; CERT-In 6-hour incident register, 180-day logs | **Missing** | — | Registers + checklists |
| 11E | Structured risk analysis per process (cause, consequence, inherent L×I, control, effectiveness, residual, action, owner, due, evidence) + **red-team** | **Missing** | Board audit gives qualitative findings | Risk & control register + red-team agent |
| 11F | ISO 9001 / 27001 / 22301, BPMN, RACI, SIPOC, PDCA, FMEA mapping to documents; never claim certification | **Partial** | Reference library names most; SIPOC used by the LSS lead | Requirement-to-control mapping |
| 12 | **Documentation Command Centre**: generate pack (company / department / process), readiness from accepted data and blockers | **Partial** | Expert board drafts single documents on request | Pack generation, readiness calculation, link to governed documents |
| 12A | Deliverables: constitution, DoA, charters, policies, SOPs, BPMN, SIPOC, RACI, risk/control, compliance register, KPI dictionary, forms/checklists, training, audit plans | **Partial** | Policy, SOP, agreement, resolution, checklist, charter | RACI, SIPOC, risk/control matrix, KPI dictionary, forms, training, audit plans |
| 12B | Standard 15-section document format; SOP step table (Step → Activity → Role → Input → System → Output → SLA → Control → Evidence) | **Partial** | House format v1 (9 sections) | Align house format to blueprint (charter v2) |
| 12C | Three-model gate: drafter, independent audit, **final validation against source records by a different model**; scores never authorise; critical issues block | **Partial** | Drafter + critics + audit + deterministic blockers; one model family | Final validator on a different model; validation against source records |
| 12D–E | Approval route by Delegation of Authority (process owner → cross-dept → legal → BE → function head → board if needed) → controlled release → acknowledgement → review schedule | **Data only** | `approval_routes`, `document_versions`, `approval_decisions`, distributions, acknowledgements (DB-tested) | Board outputs are not yet turned into governed document versions; release/acknowledgement UI |
| 13 | 12 roles; role-based **and** process-based access; invitations; revocation; MFA/SSO | **Partial** | Configurable roles, scoped assignments, RLS, invitations | MFA/SSO; role catalogue aligned to the 12 roles |
| 14A | Process maturity (5 levels, evidence-based) | **Missing** | — | |
| 14B | Improvement & automation opportunity register (savings, effort, ROI, approval) | **Missing** | Board improvement reviews (text) | Structured register |
| 14C | Change impact analysis | **Missing** | `document_change_requests` table | Impact engine |
| 14D | Management and Board dashboard | **Partial** | Process status table; discovery progress per person | Coverage, risk, policy status, dependencies, improvements |
| 15 | Classification-based AI routing; provider review; backups; retention; incident management | **Partial** | Classification guard in DB; owner acceptance recorded | Backups (PR-019), retention (NFR-08), incident register |
| 17 | Pilots: Case-to-Report and Partner lifecycle | **Missing** | — | Two pilot campaigns |
| 18 | Constitution rules (never invent, as-is ≠ approved, keep history, AI never approves its own document, recommendation ≠ law, deterministic reminders/progress/approvals, traceable recommendations) | **Partial** | Most enforced in DB/engine | "As-is vs approved" and "recommendation vs law" fields |
| 20 | Employees ask "what is the approved procedure / who approves / which document governs" — answered from approved documents with source | **Missing** | — | Policy Q&A over approved library |

## 2. Contradictions to resolve (owner decisions)

| # | Contradiction | Blueprint says | Current state | Needs |
|---|---|---|---|---|
| X-1 | Confidential data on free Gemini | §3A, §15: free tier only with synthetic/anonymised data; "Do not allow the application to send confidential company information to any free model" | D-065 (13-Nov, "send everything"): confidential allowed on `gemini_free` | **Decided 13-Nov: keep D-065** (D-072) |
| X-2 | AI agents "talk and brainstorm" (13-Nov) vs principle 3 "No uncontrolled AI-to-AI conversations" | Structured findings, orchestrator-controlled | Board is a fixed, logged plan; no free-form AI chat | **Consistent** — recorded, no action |
| X-3 | Editable BPMN vs D-054 (map read-only, corrected through chat) | Editable BPMN 2.0 | React Flow, read-only | Build BPMN editor (supersedes D-054) |
| X-4 | Multiple providers and a final validator on a **different model** vs only Gemini keys | Different model from drafter | All 26 keys are Gemini; model selectable per slot | **Decided: stronger Gemini model for validator/legal (D-075)** |
| X-5 | Email through Outlook / Microsoft Graph | §7C, §10A | No email channel | **Decided: in-app only for now (D-074)** |
| X-6 | Many free projects vs "do not design around unlimited free AI" (§16) and Google APIs Terms §2(d) | Budgeted, paid for production | 26 free projects (PR-042) | Owner awareness; paid tier before production |
| X-7 | House document format (9 sections) vs blueprint standard (15 sections + SOP step table) | §12B | Charter v1 of the document controller | Charter v2 (no owner decision needed — blueprint is the owner's standard) |
| X-8 | Company foundation before department interviews (§4) vs discovery already live for all employees | Blueprint first | Interviews running | Build the blueprint module next; department interviews then refer to it |

## 3. Technical dependencies

- **Email:** provider + sender account + credentials (owner) → reminders, digests, escalations.
- **Background worker:** pg_cron + pg_net calling a secured function (secret in Vault) → reminders, nightly re-checks, review dates.
- **Legal sources:** web-grounded research (Gemini "grounding with Google Search" or fetched official pages) — outputs stay *unverified* until a qualified reviewer marks them reviewed (AC-09).
- **BPMN:** bpmn-js (bpmn.io licence requires its watermark to stay visible).
- **Backups:** Supabase Free has no backups (PR-019) — external dump or Pro before the pilot (blueprint Stage 2).

## 4. Proposed module order (each module: functional, DB, UI, security, API, acceptance tests, error handling, docs)

| # | Module | Blueprint § | Why this position |
|---|---|---|---|
| M1 ✅ | **Catalogue & classification** (done 13-Nov) — 16 functions, 23 enterprise policies, department SOP lists; Mandatory/Required/Recommended/N.A. with reason + approval; process-gap vs document-gap view | 5 | Foundation for suggestions, progress and document packs; seeded as data, fully configurable |
| M2 | **Company Operating Blueprint** — leadership discovery, VOC/VOB/VOE/VOR, CTQ with management-approved targets | 4 | §4 says it must precede department interviews |
| M3 | **Interview upgrade** — 3 contextual suggestions + full answer options, 20 dimensions, "Your Answer in Action" card, department-head validation | 6, 9 | Biggest daily user impact |
| M4 | **Cross-department engine** — cross-person contradictions, as-is/should-be/future-state, richer clarification tasks, decision register, worker + email reminders/digest/escalation | 7 | Needs M1 + email |
| M5 | **Four progress indicators** + "why progress changed" | 8 | Needs M3 + M4 |
| M6 | **Risk, control & legal registers** — FMEA-style risk per process, controls, red-team, classified findings, source-backed legal register, DPDP/CERT-In registers | 11 | Needs processes from M3 |
| M7 | **Documentation Command Centre** — packs, readiness, 15-section format, 3-model gate (different-model validator), board output → governed document version → DoA approval route → release → acknowledgement → review dates | 12 | Needs M1, M5, M6 |
| M8 | **Editable BPMN** with swimlanes, as-is/to-be | 6D | Independent; large |
| M9 | **Governance** — maturity, improvement register, change impact, management/board dashboard, employee policy Q&A | 14, 20 | Needs approved documents |
| M10 | **Platform** — other providers, token budgets + cost log + modes, voice, Hindi/Marathi, MFA, backups, retention | 3, 9, 15 | Parallel, mostly owner-dependent |

Pilots (§17) start after M4: **Case-to-Report** and **Partner lifecycle**.
