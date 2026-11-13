// Deterministic comparison of several people's descriptions of the same work (consolidation, 13-Nov-2026).
// The free drafting model misattributed who said what (live test, board v6/v7), so "which description mentions which step" is
// computed here, never by the AI. Pure function; the SAME file is used by the Edge Function and the web app (web/lib/compare.ts is a
// byte-identical copy, checked in CI).

export type DescStep = { label: string; decision?: boolean; system?: string | null };
export type CompareRow = { steps: (DescStep | null)[]; everyone: boolean };   // steps[k] = description k's own wording, or null = not mentioned

const STOP = new Set(["the", "a", "an", "to", "of", "and", "or", "for", "by", "on", "in", "into", "with", "from", "is", "are", "be", "any", "all",
  "it", "its", "their", "each", "if", "then", "as", "at", "via", "per", "this", "that", "who", "which", "whether", "do", "does"]);

/** Content words of a step label, lightly stemmed ("emails" → "email", "cases" → "case"). */
export function stepTokens(label: string): Set<string> {
  const words = label.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((w) => w && !STOP.has(w));
  return new Set(words.map((w) => (w.length > 4 && w.endsWith("ies") ? w.slice(0, -3) + "y" : w.length > 3 && w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w)));
}

/** Dice similarity of two token sets. */
export function dice(a: Set<string>, b: Set<string>) {
  if (!a.size || !b.size) return 0;
  let n = 0; for (const x of a) if (b.has(x)) n++;
  return (2 * n) / (a.size + b.size);
}

/**
 * Groups equivalent steps across descriptions: best pairs first; a group never holds two steps of the same description.
 * Rows come back in the typical order of the work (average relative position).
 */
export function compareDescriptions(descs: DescStep[][], threshold = 0.35): CompareRow[] {
  type Node = { d: number; i: number; tok: Set<string>; step: DescStep };
  const nodes: Node[] = descs.flatMap((steps, d) => steps.map((step, i) => ({ d, i, tok: stepTokens(step.label), step })));
  const group = nodes.map((_, k) => k);
  const find = (k: number): number => (group[k] === k ? k : (group[k] = find(group[k]!)));
  const members = (g: number) => nodes.filter((_, k) => find(k) === g);
  const pairs: { a: number; b: number; s: number }[] = [];
  for (let a = 0; a < nodes.length; a++) for (let b = a + 1; b < nodes.length; b++) {
    if (nodes[a]!.d === nodes[b]!.d) continue;
    const s = dice(nodes[a]!.tok, nodes[b]!.tok);
    if (s >= threshold) pairs.push({ a, b, s });
  }
  pairs.sort((x, y) => y.s - x.s || x.a - y.a || x.b - y.b);
  for (const { a, b } of pairs) {
    const ga = find(a), gb = find(b);
    if (ga === gb) continue;
    const da = new Set(members(ga).map((m) => m.d));
    if (members(gb).some((m) => da.has(m.d))) continue;   // one step per description per row
    group[gb] = ga;
  }
  const rows = new Map<number, Node[]>();
  nodes.forEach((n, k) => rows.set(find(k), [...(rows.get(find(k)) ?? []), n]));
  const pos = (n: Node) => (descs[n.d]!.length > 1 ? n.i / (descs[n.d]!.length - 1) : 0);
  return [...rows.values()]
    .map((ms) => ({ ms, at: ms.reduce((s, m) => s + pos(m), 0) / ms.length }))
    .sort((x, y) => x.at - y.at)
    .map(({ ms }) => {
      const steps: (DescStep | null)[] = descs.map((_, d) => ms.find((m) => m.d === d)?.step ?? null);
      return { steps, everyone: steps.every(Boolean) };
    });
}

const cell = (s: DescStep | null) => (s ? `${s.decision ? "Decision: " : ""}${s.label}${s.system ? ` (system: ${s.system})` : ""}` : "— not mentioned");

/** Plain-text table for the board's sources (authoritative for who mentioned what). */
export function comparisonText(rows: CompareRow[], n: number) {
  return `AUTOMATIC COMPARISON of the ${n} descriptions (computed from each person's process map — authoritative for which description mentions which step; "not mentioned" means that person did not mention it): `
    + rows.map((r, k) => `Row ${k + 1}${r.everyone ? " [all]" : ` [only ${r.steps.map((s, d) => (s ? d + 1 : 0)).filter(Boolean).join(", ")} of ${n}]`}: `
      + r.steps.map((s, d) => `D${d + 1}: ${cell(s)}`).join(" | ")).join(". ") + ".";
}

/** Markdown annex appended to the final board document (people are numbered, never named). */
export function comparisonAnnex(rows: CompareRow[], n: number) {
  const esc = (t: string) => t.replace(/\|/g, "/");
  const head = `| # | ${Array.from({ length: n }, (_, d) => `Description ${d + 1}`).join(" | ")} | Mentioned by |\n|---|${"---|".repeat(n)}---|`;
  const body = rows.map((r, k) => `| ${k + 1} | ${r.steps.map((s) => esc(cell(s))).join(" | ")} | ${r.everyone ? "all" : `${r.steps.filter(Boolean).length} of ${n}`} |`).join("\n");
  const diffs = rows.filter((r) => !r.everyone).length;
  return `\n\n## Annex — How the ${n} descriptions compare (automatic)\n\nComputed by the platform from each interviewed person's own process map (people are numbered, not named). `
    + `${diffs ? `${diffs} step${diffs === 1 ? " is" : "s are"} not mentioned by everyone — the process owner confirms which practice is the standard.` : "Every step is mentioned by everyone."} `
    + `Matching is by wording; check rows that look merged or split.\n\n${head}\n${body}\n`;
}
