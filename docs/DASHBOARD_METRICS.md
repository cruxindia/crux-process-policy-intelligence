# MVP Dashboard Metric Definitions

**Status:** Drafted · **Source object:** `public.dashboard_process_status` (security_invoker view: every count is limited to rows the viewer may read) · **Owner:** to be assigned (AQ-015)

Each metric counts rows for one process. No targets are set; none are implied.

| Metric | Definition / formula | Source | Notes |
|---|---|---|---|
| `latest_version_status` | Status of the highest `version_no` in `process_versions` | process_versions | AS-IS or TO-BE shown in `latest_version_kind` |
| `knowledge_pending_review` | count(knowledge_records) where lifecycle_status ∈ {draft, submitted, under_review} | knowledge_records | |
| `knowledge_verified` | count(knowledge_records) where lifecycle_status ∈ {verified, approved} | knowledge_records | verified ≠ formally approved |
| `open_hypotheses` | count where claim_origin ∈ {ai_inference, unverified_hypothesis} and status ∉ {rejected, superseded, retired} | knowledge_records | open gaps the AI could not support with a source |
| `open_clarifications` | count(clarification_tasks) where status ∉ {resolved, cancelled} | clarification_tasks | |
| `overdue_clarifications` | open_clarifications with `due_at < now()` | clarification_tasks | UTC timestamps; display in company timezone |
| `open_disputes` | count(disputes) where status ∉ {decided, withdrawn} | disputes | |
| `documents_in_approval` | count(document_versions) with status = in_review, for documents linked to the process | document_versions, documents | |
| `documents_published` | count with status = published | document_versions | at most 1 per document by constraint |

Not yet defined (need owner decision): completeness %, approval cycle time, acknowledgement rate, interview drop-off.
