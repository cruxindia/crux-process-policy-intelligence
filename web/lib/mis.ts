// MIS catalogue (PPI-042, D-100). The data comes from public.mis_report / public.platform_mis; this file only names
// and explains each report, and turns a result into CSV.

export type Mis = { code: string; title: string; why: string; group: string; companyWide?: boolean; adminOnly?: boolean };

export const COMPANY_MIS: Mis[] = [
  { code: "participation", group: "People & adoption", title: "Participation by department", why: "Who has joined and how far each department is with its interviews." },
  { code: "people_progress", group: "People & adoption", title: "Interview progress by person", why: "Each person's interview status and last activity — who to encourage next." },
  { code: "recognition", group: "People & adoption", title: "Contribution & recognition", why: "Who answered, solved tasks and helped colleagues — for appreciation and rewards." },
  { code: "process_register", group: "Processes", title: "Process register", why: "Every process with its owner function, classification, validation and document status." },
  { code: "discovery_funnel", group: "Processes", title: "Discovery funnel by department", why: "From “found in interviews” to “documented and approved”, per department." },
  { code: "documents", group: "Documents", title: "Documents from the expert board", why: "Drafts, approvals, time to decision and where each document is shared.", companyWide: true },
  { code: "open_questions", group: "Work & follow-up", title: "Open questions and requests", why: "Unanswered colleague requests and leadership questions, oldest first." },
  { code: "tickets_sla", group: "Work & follow-up", title: "Tasks & tickets — service levels", why: "Opened, resolved, overdue and escalated work, and the average time to resolve." },
  { code: "workload", group: "Work & follow-up", title: "Workload by person", why: "Open and overdue tasks per person — spot overload early." },
  { code: "improvements", group: "Work & follow-up", title: "Improvements and risk actions", why: "Improvement ideas and risk actions, with owners and due dates." },
  { code: "projects", group: "Projects", title: "Projects", why: "Each engagement project with milestones done, overdue and days to target.", companyWide: true },
  { code: "ai_usage", group: "Platform use", title: "AI usage", why: "AI runs by month, provider and purpose, with success rate.", companyWide: true },
  { code: "api_usage", group: "Platform use", title: "Website & app reads", why: "How often each shared document is read by your website and apps.", companyWide: true, adminOnly: true },
  { code: "billing", group: "Platform use", title: "Invoices", why: "Invoices, GST, totals, due and paid dates.", companyWide: true, adminOnly: true },
];

export const PLATFORM_MIS: Mis[] = [
  { code: "portfolio", group: "Clients", title: "Company portfolio", why: "Every client company with package, adoption, processes, documents and last activity." },
  { code: "revenue", group: "Money", title: "Revenue by month", why: "Invoiced, paid and outstanding per company and month." },
  { code: "receivables", group: "Money", title: "Receivables", why: "Unpaid invoices with days overdue and disputes." },
  { code: "ai_pool", group: "Operations", title: "AI pool utilisation", why: "Calls and health per pool key." },
  { code: "support", group: "Operations", title: "Support & billing tickets", why: "Requests from companies, their age and time to resolve." },
];

export type MisResult = { title: string; columns: string[]; rows: (string | number | null)[][]; from: string; to: string; scope?: string };

/** CSV for Excel: UTF-8 BOM, quoted cells, and spreadsheet-formula injection neutralised (=, +, -, @ at the start). */
export function toCsv(r: MisResult): string {
  const cell = (v: unknown) => {
    if (v === null || v === undefined) return "";
    let s = String(v);
    if (typeof v === "string" && /^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return "﻿" + [r.columns, ...r.rows].map((row) => row.map(cell).join(",")).join("\r\n") + "\r\n";
}

export const csvName = (title: string, from: string, to: string) => `${title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}_${from}_${to}.csv`;

/** Period from the query string (defaults: this month to today, India time). */
export function period(sp: Record<string, string | undefined>, defaultMonthsBack = 0) {
  const ok = (s?: string) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : undefined);
  return { from: ok(sp.from), to: ok(sp.to), monthsBack: defaultMonthsBack };
}
