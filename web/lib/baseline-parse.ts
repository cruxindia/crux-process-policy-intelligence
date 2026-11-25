// Turns an audit-readiness master workbook (sheets of rows) into baseline rows for import (PPI-046).
// Every non-empty row after a sheet's header is kept, keyed by its header; code / title / department are pulled out for lookups.
// Pure: tested in Node against the real workbook, used in the browser by the platform import page.
import type { Sheet } from "./office-text";

export type BaselineRow = { row_no: number; code: string | null; title: string | null; department: string | null; data: Record<string, string> };
export type ParsedSheet = { sheet: string; header_row: number; columns: string[]; rows: BaselineRow[] };

const CODE_COLS = ["Document ID", "Process ID", "Legal ID", "Test ID", "Object ID", "Assessment ID", "Gap ID", "Workflow ID", "Correction ID", "Gate",
  "Playbook ID", "Task ID", "Transition ID", "Change ID", "Handover ID", "Contract ID", "Partner ID", "Scope ID", "Ref", "Employee / Role ID"];
const TITLE_COLS = ["Policy / Process Document", "End-to-End Process", "Indian Law / Regulatory Instrument", "Process / Control Area", "Document / Process Name",
  "Applicability Question", "Missing / Underdeveloped Process", "Cross-Functional Workflow", "End-to-end process", "Required Action / Control",
  "Release / Control Gate", "Critical Role / Process", "Role / Function", "Instrument / Regulatory Change", "Document / Process", "Dependent Name",
  "Linked Policy / Process", "Document control field", "Documents / Control Areas", "Event / Trigger", "Relationship / Mapping", "From Status",
  "Implementation Stage / Control", "Role / Process / Control", "Counterparty Legal Name", "Legal Entity Name"];
const DEPT_COLS = ["Function / Department", "Department / Accountable Function", "Department / Function", "Function", "Primary Owner", "Accountable Function (source RACI)"];
/** Sheets that are notes / dashboards rather than tables: every non-empty row is kept as numbered cells. */
const FREEFORM = new Set(["Start Here", "Readiness Dashboard"]);

const filled = (r: string[] | undefined) => (r ?? []).filter((c) => c !== "").length;
const norm = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();

/** Header = first row with at least 3 filled cells whose next filled row is not a single title cell. */
export function headerRow(rows: string[][]): number {
  for (let r = 0; r < rows.length; r++) {
    if (filled(rows[r]) < 3) continue;
    return r;
  }
  return -1;
}

export function parseSheet(s: Sheet): ParsedSheet {
  const rows = s.rows;
  if (FREEFORM.has(s.name)) {
    const out: BaselineRow[] = [];
    rows.forEach((r, i) => { if (filled(r)) out.push({ row_no: i + 1, code: null, title: (r.find(Boolean) ?? "").slice(0, 500), department: null,
      data: Object.fromEntries(r.map((c, k) => [`c${k + 1}`, c]).filter(([, c]) => c !== "")) }); });
    return { sheet: s.name, header_row: 0, columns: [], rows: out };
  }
  const h = headerRow(rows);
  if (h < 0) return { sheet: s.name, header_row: 0, columns: [], rows: [] };
  const header = rows[h]!;
  const columns = header.map((c, k) => (c ? c.replace(/\s*\n\s*/g, " — ").trim() : `Column ${k + 1}`));
  const pick = (cands: string[]) => { for (const c of cands) { const k = columns.findIndex((x) => norm(x) === norm(c)); if (k >= 0) return k; } return -1; };
  const kc = pick(CODE_COLS), kt = pick(TITLE_COLS), kd = pick(DEPT_COLS);
  const headerKey = norm(header.join("|"));
  const out: BaselineRow[] = [];
  for (let r = h + 1; r < rows.length; r++) {
    const row = rows[r] ?? [];
    if (!filled(row) || norm(row.join("|")) === headerKey) continue;   // blank or a repeated header
    const data: Record<string, string> = {};
    row.forEach((c, k) => { if (c !== "") data[columns[k] ?? `Column ${k + 1}`] = c; });
    const title = kt >= 0 ? row[kt] || null : row[1] || row[0] || null;
    out.push({ row_no: r + 1, code: kc >= 0 ? row[kc] || null : null, title: title ? title.slice(0, 500) : null, department: kd >= 0 ? row[kd] || null : null, data });
  }
  return { sheet: s.name, header_row: h + 1, columns, rows: out };
}

/** Workbook-level facts for the version record (title, as-of date) read from the "Start Here" sheet when present. */
export function workbookFacts(sheets: Sheet[]) {
  const start = sheets.find((s) => s.name === "Start Here");
  const first = start?.rows.find((r) => filled(r))?.filter(Boolean).join(" — ") ?? "";
  const asOfRow = start?.rows.find((r) => /^as-of date$/i.test(r[0] ?? ""));
  const asOf = asOfRow?.[1] ?? "";
  const m = /(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/.exec(asOf);
  const months = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
  const iso = m && months.indexOf(m[2]!.toLowerCase()) >= 0 ? `${m[3]}-${String(months.indexOf(m[2]!.toLowerCase()) + 1).padStart(2, "0")}-${m[1]!.padStart(2, "0")}` : null;
  const version = /\bV(\d+(?:\.\d+)*)\b/i.exec(first)?.[1] ?? null;
  return { title: first.replace(/\s*[|—-]\s*V\d+(\.\d+)*\s*$/i, "").trim() || "Baseline", asOf: iso, version };
}
