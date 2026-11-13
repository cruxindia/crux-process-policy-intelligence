// The 20 process-discovery dimensions (blueprint §6C, D-086). Byte-identical copy in web/lib/dimensions.ts (CI diffs them).
// Pure data + functions; no imports, so it runs in Deno, Node and the Next.js bundle.

export const DIMENSIONS = [
  { key: "purpose", label: "Purpose", ask: "Why is this process performed?", critical: true },
  { key: "trigger", label: "Trigger", ask: "What starts the process?", critical: true },
  { key: "input", label: "Input", ask: "What information or documents are needed?", critical: true },
  { key: "source", label: "Source", ask: "Who provides the input?", critical: false },
  { key: "owner", label: "Owner", ask: "Who is accountable?", critical: true },
  { key: "participants", label: "Participants", ask: "Who performs each step?", critical: false },
  { key: "activities", label: "Steps", ask: "What exactly happens, in sequence?", critical: true },
  { key: "decisions", label: "Decisions", ask: "Who decides what happens next, and using what criteria?", critical: true },
  { key: "systems", label: "Systems", ask: "Which software, tools, forms or registers are used?", critical: false },
  { key: "approvals", label: "Approvals", ask: "Who approves, and within what authority?", critical: false },
  { key: "output", label: "Output", ask: "What is produced at the end?", critical: true },
  { key: "recipient", label: "Recipient", ask: "Who receives the result?", critical: false },
  { key: "sla", label: "Turnaround", ask: "What is the required turnaround time?", critical: false },
  { key: "exceptions", label: "Exceptions", ask: "What happens when something goes wrong?", critical: true },
  { key: "escalation", label: "Escalation", ask: "Who is approached, and when?", critical: false },
  { key: "controls", label: "Controls", ask: "What prevents errors, fraud, misuse or unauthorised action?", critical: true },
  { key: "evidence", label: "Evidence", ask: "How can we prove the work was completed correctly?", critical: false },
  { key: "kpi", label: "KPI", ask: "How is performance measured?", critical: false },
  { key: "risks", label: "Risks", ask: "What could fail, and what would be the impact?", critical: false },
  { key: "improvements", label: "Improvements", ask: "Could this work be simplified, automated or eliminated?", critical: false },
] as const;

export type DimKey = (typeof DIMENSIONS)[number]["key"];
export const DIM_KEYS = DIMENSIONS.map((d) => d.key) as DimKey[];
export const DIM_LABEL: Record<string, string> = Object.fromEntries(DIMENSIONS.map((d) => [d.key, d.label]));
export type DimStatus = "not_started" | "partial" | "sufficient" | "not_applicable";
export const DIM_STATUSES = ["not_started", "partial", "sufficient", "not_applicable"] as const;

/** How many non-critical dimensions may stay untouched while a process still counts as well understood (D-086). */
export const MAX_UNTOUCHED_OPTIONAL = 4;

/** The 10 dimensions used before 14-Nov-2026 → the 20. The first target keeps the old status; the others get at most "partial". */
export const LEGACY_MAP: Record<string, DimKey[]> = {
  purpose: ["purpose"], trigger: ["trigger", "input"], roles: ["owner", "participants"], activities: ["activities", "decisions"],
  systems: ["systems"], tat: ["sla"], controls: ["controls", "approvals"], exceptions: ["exceptions", "escalation"],
  dependencies: ["recipient", "source"], performance: ["kpi", "improvements"],
};

const rank: Record<string, number> = { not_started: 0, partial: 1, sufficient: 2, not_applicable: 2 };
const isStatus = (s: unknown): s is DimStatus => typeof s === "string" && (DIM_STATUSES as readonly string[]).includes(s);

/** Coverage in the 20-dimension form. Accepts old keys (mapped) and new keys; never upgrades a derived dimension past "partial". */
export function normaliseCoverage(raw: unknown): Record<DimKey, DimStatus> {
  const src = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const out = Object.fromEntries(DIM_KEYS.map((k) => [k, "not_started"])) as Record<DimKey, DimStatus>;
  const put = (k: DimKey, s: DimStatus) => { if (rank[s]! > rank[out[k]]! || (s === "not_applicable" && out[k] !== "sufficient")) out[k] = s; };
  // Legacy form = uses an old-only key (roles, tat, dependencies, performance) and no new-only key; then every key is mapped.
  const keys = Object.keys(src);
  const legacy = keys.some((k) => k in LEGACY_MAP && !(DIM_KEYS as string[]).includes(k)) && !keys.some((k) => (DIM_KEYS as string[]).includes(k) && !(k in LEGACY_MAP));
  for (const [k, v] of Object.entries(src)) {
    if (!isStatus(v)) continue;
    if (!legacy) { if ((DIM_KEYS as string[]).includes(k)) put(k as DimKey, v); continue; }
    (LEGACY_MAP[k] ?? []).forEach((t, i) => put(t, i === 0 ? v : v === "not_started" ? "not_started" : "partial"));
  }
  return out;
}

const score = (s: DimStatus | undefined) => (s === "sufficient" || s === "not_applicable" ? 1 : s === "partial" ? 0.5 : 0);

/** Completeness 0-100: critical dimensions weigh double; "not applicable" counts as covered. */
export function completeness(coverage: unknown) {
  const c = normaliseCoverage(coverage); let s = 0, w = 0;
  for (const d of DIMENSIONS) { const k = d.critical ? 2 : 1; w += k; s += k * score(c[d.key]); }
  return Math.round((s / w) * 100);
}

/** Well understood: every critical dimension sufficient (or not applicable) and at most MAX_UNTOUCHED_OPTIONAL others untouched. */
export function sufficient(coverage: unknown) {
  const c = normaliseCoverage(coverage);
  const critOk = DIMENSIONS.every((d) => !d.critical || c[d.key] === "sufficient" || c[d.key] === "not_applicable");
  const untouched = DIMENSIONS.filter((d) => !d.critical && c[d.key] === "not_started").length;
  return critOk && untouched <= MAX_UNTOUCHED_OPTIONAL;
}
