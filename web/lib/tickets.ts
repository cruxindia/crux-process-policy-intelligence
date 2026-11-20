// Labels shared by the task pages (company and platform).
export const KIND: Record<string, string> = { action: "Action", review: "Review", approval: "Approval", improvement: "Improvement idea",
  risk_action: "Risk action", question: "Question", support: "Support", billing_dispute: "Billing dispute" };
export const PRIORITY: Record<string, string> = { critical: "Critical", high: "High", normal: "Normal", low: "Low" };
export const STATUS: Record<string, string> = { open: "Open", in_progress: "In progress", waiting: "Waiting", resolved: "Resolved", closed: "Closed", cancelled: "Cancelled" };
export const OPEN = ["open", "in_progress", "waiting"];
export const statusBadge = (s: string, overdue: boolean) => overdue ? "danger" : s === "resolved" || s === "closed" ? "ok" : s === "in_progress" ? "part" : s === "cancelled" ? "" : "warn";
export const priorityBadge = (p: string) => p === "critical" ? "danger" : p === "high" ? "warn" : "";
