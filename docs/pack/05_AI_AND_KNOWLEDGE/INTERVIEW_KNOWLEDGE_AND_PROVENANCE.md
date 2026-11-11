# Interview, Shared Knowledge and Evidence Provenance

## 1. Interview philosophy

The interview is a guided discovery conversation, not a static form. It should establish what the respondent knows, what they do not know, what varies, who else is involved, what evidence exists and what needs validation.

## 2. Interview phases

### Phase A — Respondent context
- Name/identity from authenticated membership.
- Department(s), role(s), location and responsibilities.
- Processes handled, supported or approved.
- Knowledge boundary: direct owner, performer, reviewer, approver, observer or referring to another expert.

### Phase B — Department/function context
- Department purpose and services.
- Internal/external customers.
- Inputs received and outputs delivered.
- Systems, tools, reports and records.
- Key metrics, pain points, risks and dependencies.

### Phase C — Process discovery
- Process name and purpose.
- Trigger and frequency/volume.
- Start and finish.
- Step-by-step activities.
- Actor and responsible role at every step.
- Inputs, outputs and evidence.
- Systems and manual work.
- Decisions and branches.
- Handoffs, waits and queues.
- TAT/SLA, targets and measurement method.
- Exceptions, rework, failures and escalations.
- Controls, approvals and decision rights.
- Dependencies on other departments or third parties.

### Phase D — Validation and challenge
- What varies by client, location, product, case type or threshold?
- What happens when information is missing or a step fails?
- What is common practice versus written policy?
- What proof supports the answer?
- Who may disagree or have a different view?
- What changed recently?
- What is the respondent unsure about?

### Phase E — Review with respondent
- Show structured summary in plain language.
- Distinguish direct answers from AI-inferred structure.
- Ask respondent to confirm, correct or flag unknown.
- Submit the session with any pending items clearly recorded.

## 3. Adaptive question logic

For each field, maintain state: unknown, asked, answered, ambiguous, contradicted, evidence-required, reviewed, accepted or not-applicable.

Prioritise the next question using:
- importance to process completeness;
- impact/risk if wrong;
- whether the respondent is qualified to answer;
- unresolved contradiction;
- dependencies between fields;
- time/effort required from respondent.

Do not simply ask all possible questions. Ask the next highest-value question. Limit repeated follow-up and allow deferral to another owner.

### Example adaptive path

Question: "What triggers this process?"

If answer is "when a case comes in":
- Ask what event counts as case received.
- Ask who/which system records receipt.
- Ask whether all case types follow the same trigger.

If answer is "after branch uploads complete documents":
- Ask who determines completeness.
- Ask which checklist/version is used.
- Ask what happens when documents are incomplete.

If respondent says "I am not sure":
- Ask who owns the trigger definition or whether an example can be shared.
- Create a clarification task if needed.

## 4. Source hierarchy and claim typing

Do not use a universal simplistic ranking that declares one type of source always correct. Record source type, authority, date, scope and context, then let the appropriate owner/reviewer assess conflicts.

Suggested claim labels:
- Direct employee statement.
- Direct observation.
- Source-document extract.
- System-of-record extract.
- External reference.
- Management decision.
- AI interpretation/inference.
- Unverified hypothesis.

Suggested evidence attributes:
- owner/uploader;
- creation and effective date;
- source system or issuing party;
- applicable client/entity/location/process;
- version/status;
- file hash;
- relevant page/section/record locator;
- reviewer assessment of authenticity, relevance and currency.

## 5. Knowledge record requirements

Every material knowledge item should include:
- stable ID;
- company and scope;
- type and title;
- atomic statement where possible;
- direct/inferred origin;
- creator/contributor;
- source IDs and source spans;
- applicable process/department/policy;
- status and review requirements;
- confidence score if generated, with explanation and calibration warning;
- created/updated/effective/review timestamps;
- revision/supersession links;
- reviewer and decision rationale where reviewed.

A confidence score is a model-quality signal, not evidence and not approval.

## 6. Contradiction detection

Compare statements only after resolving whether they refer to the same:
- process and process version;
- client/product/case type;
- geography/location;
- period/effective date;
- condition or threshold;
- role/responsibility;
- measurement definition.

Many apparent contradictions are context differences. Store the matching dimensions and explain why conflict was flagged. Keep both statements and create a clarification only when material.

## 7. Evidence linking

- A knowledge claim can cite multiple answers and evidence files.
- Evidence can support, contradict, qualify or contextualise a claim.
- Source links should support precise locator data (page, section, timestamp, row or record ID).
- A file's presence does not prove the claim; evidence review is separate.
- Superseded documents remain linked for historical context but must not appear as current authority without warning.

## 8. Human review states

Suggested states:
- AI suggested;
- submitted by employee;
- under review;
- verified (source/content checked);
- approved (formal authority accepted, where required);
- disputed;
- rejected;
- superseded;
- retired.

The workflow should specify which state is required for each record type. A process observation may be verified without being an approved policy. A policy clause may require formal approval before publication.

## 9. Minimum provenance acceptance tests

1. Open any AI-generated process step and retrieve the exact originating answer(s).
2. Open the original answer and see participant, session and timestamp.
3. Open attached evidence using authorised access only.
4. Identify which parts are direct statements and which are inference.
5. Revise a knowledge item without losing the old revision.
6. Dispute a statement without deleting either position.
7. Supersede an approved item and preserve its historical relationship.
8. Search never reveals restricted source content to an unauthorised user.
