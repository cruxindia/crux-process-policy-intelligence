// Draft SOP steps from a discovered process map. Pure and deterministic: it only re-orders what the employee said
// (no AI, nothing invented). Decisions become "If …" lines; open branches are reported as gaps for the reviewer.
export type SopNode = { id: string; type: string; label: string; actor?: string; system?: string };
export type SopEdge = { from: string; to: string; label?: string };
export type SopLine = { n: string; text: string; actor?: string; system?: string; kind: "step" | "decision" | "branch" | "handover" | "start" | "end" };

export function draftSop(flow: { nodes: SopNode[]; edges: SopEdge[] } | null | undefined): { lines: SopLine[]; gaps: string[] } {
  const nodes = flow?.nodes ?? [];
  if (!nodes.length) return { lines: [], gaps: [] };
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const edges = (flow?.edges ?? []).filter((e) => byId.has(e.from) && byId.has(e.to));
  const out = new Map<string, SopEdge[]>();
  const indeg = new Map(nodes.map((n) => [n.id, 0]));
  for (const e of edges) { out.set(e.from, [...(out.get(e.from) ?? []), e]); indeg.set(e.to, (indeg.get(e.to) ?? 0) + 1); }
  // Roots: explicit start nodes first, then anything with no incoming edge, then (cycles) the first node.
  const roots = [...nodes.filter((n) => n.type === "start"), ...nodes.filter((n) => n.type !== "start" && !indeg.get(n.id))];
  if (!roots.length) roots.push(nodes[0]!);
  const seen = new Set<string>(); const lines: SopLine[] = []; const gaps: string[] = [];
  let step = 0;
  const visit = (id: string, prefix: string) => {
    if (seen.has(id)) return;
    seen.add(id);
    const n = byId.get(id)!;
    const outs = out.get(id) ?? [];
    if (n.type === "decision") {
      step++;
      lines.push({ n: `${prefix}${step}`, text: `Decide: ${n.label}`, actor: n.actor, system: n.system, kind: "decision" });
      if (outs.length < 2) gaps.push(`“${n.label}” — only ${outs.length ? "one outcome is" : "no outcome is"} described; what happens otherwise?`);
      const base = `${prefix}${step}`;
      outs.forEach((e, i) => {
        const t = byId.get(e.to)!;
        lines.push({ n: `${base}.${String.fromCharCode(97 + i)}`, text: `If ${e.label || "otherwise"}: ${t.label}`, actor: t.actor, system: t.system, kind: "branch" });
        seen.add(t.id);
        for (const e2 of out.get(t.id) ?? []) visit(e2.to, prefix);
      });
      return;
    }
    if (n.type !== "start" && n.type !== "end") step++;
    lines.push({ n: n.type === "start" ? "Trigger" : n.type === "end" ? "End" : `${prefix}${step}`,
      text: n.type === "handover" ? `Hand over: ${n.label}` : n.label, actor: n.actor, system: n.system,
      kind: n.type === "start" ? "start" : n.type === "end" ? "end" : n.type === "handover" ? "handover" : "step" });
    for (const e of outs) visit(e.to, prefix);
  };
  for (const r of roots) visit(r.id, "");
  for (const n of nodes) if (!seen.has(n.id)) { step++; lines.push({ n: String(step), text: n.label, actor: n.actor, system: n.system, kind: "step" }); gaps.push(`“${n.label}” is not connected to the other steps.`); }
  if (!nodes.some((n) => n.type === "end")) gaps.push("The end of the process (what “done” looks like) has not been described yet.");
  return { lines, gaps };
}
