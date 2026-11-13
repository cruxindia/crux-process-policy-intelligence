// Shared labels for the expert board UI.
export const STATUS_LABEL: Record<string, string> = {
  queued: "Starting", running: "Experts at work", waiting: "Paused", awaiting_approval: "Ready for your decision",
  approved: "Approved", rejected: "Rejected", failed: "Stopped",
};
export const DOC_LABEL: Record<string, string> = {
  policy: "Policy", sop: "SOP", agreement: "Agreement / contract", board_resolution: "Board resolution",
  compliance_checklist: "Compliance checklist", charter: "Project / improvement charter", other: "Other document",
};
export const KIND_LABEL: Record<string, string> = {
  proposal: "Proposes", critique: "Critiques", consolidation: "Consolidates", format: "Formats", audit: "Audits",
};
/** One colour per team (works on light and dark backgrounds). */
export const TEAM_COLOR: Record<string, string> = {
  pmo: "#2563eb", docs: "#7c3aed", legal: "#b45309", cs: "#0f766e", finance: "#15803d", audit: "#be123c", interview: "#64748b",
};
