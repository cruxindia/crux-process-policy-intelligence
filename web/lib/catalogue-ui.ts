// Shared labels for the catalogue (PPI-030). Plain words for people; codes stay in the database.
export const CLASS_LABEL: Record<string, string> = {
  unassessed: "Not yet assessed", mandatory: "Mandatory", required: "Required", recommended: "Recommended", not_applicable: "Not applicable",
};
export const CLASS_HELP: Record<string, string> = {
  mandatory: "A verified legal, regulatory or contractual requirement, or a formally approved company requirement.",
  required: "An operational process the company needs in order to function.",
  recommended: "Would improve performance or reduce risk.",
  not_applicable: "Not needed for Crux's business model — say why.",
  unassessed: "Back to not yet assessed.",
};
export const BASIS_LABEL: Record<string, string> = {
  law: "Law", regulation: "Regulation / regulator direction", contract: "Client or vendor contract", company_decision: "Approved company decision",
  operational_need: "Operational need", improvement: "Improvement", not_needed: "Not needed",
};
export const PROCESS_LABEL: Record<string, string> = { unknown: "Not known yet", not_performed: "Not done today", partial: "Done in part", performed: "Done today" };
export const DOC_STATUS_LABEL: Record<string, string> = {
  unknown: "Not known yet", none: "No document", exists_outside: "Exists outside this platform", draft: "Being drafted",
  in_review: "In review", approved: "Approved", outdated: "Outdated",
};
export const GAP_LABEL: Record<string, string> = {
  needs_assessment: "Needs assessment", unknown: "Is it done today?", process_gap: "Process missing", documentation_gap: "Document missing",
  document_in_progress: "Document in progress", document_outdated: "Document outdated", covered: "Covered", opportunity: "Opportunity",
  not_applicable: "Not applicable", inactive: "Retired",
};
export const GAP_ORDER = ["process_gap", "documentation_gap", "document_outdated", "needs_assessment", "unknown", "document_in_progress", "opportunity", "covered", "not_applicable"];
export const GAP_TONE: Record<string, string> = { process_gap: "danger", documentation_gap: "warn", document_outdated: "warn", covered: "ok", document_in_progress: "part" };
export const KIND_LABEL: Record<string, string> = { policy: "Policy", sop: "SOP", process: "Process" };
