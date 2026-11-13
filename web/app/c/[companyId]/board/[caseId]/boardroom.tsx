"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Background, Controls, Handle, MarkerType, Position, ReactFlow, type Edge, type Node, type NodeProps } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { createClient } from "@/lib/supabase/client";
import { Markdown } from "@/lib/md";
import { KIND_LABEL, STATUS_LABEL, TEAM_COLOR } from "@/lib/board-ui";

export type Role = { code: string; title: string; credentials: string; version: number; team_code: string; team_name: string };
export type Turn = { seq: number; step: number; role_code: string; team_code: string; kind: string; addressed_to: string[]; summary: string;
  content: string; citations: string[]; verdict: string | null; created_at: string };
export type Output = { version: number; title: string; body_md: string; dissent: string | null; audit_verdict: string | null; audit_notes: string | null; created_at: string };
export type CaseRow = { id: string; status: string; next_step: number; plan: { role: string; kind: string; to: string[] }[] | null; last_error: string | null;
  run_lock_until: string | null; revision_rounds: number; title: string };

type NData = { role: Role; active: boolean; spoke: number; selected: boolean };
function ExpertNode({ data }: NodeProps<Node<NData>>) {
  const c = TEAM_COLOR[data.role.team_code] ?? "#64748b";
  return (
    <div className={`bnode${data.active ? " active" : ""}${data.selected ? " sel" : ""}`} style={{ borderColor: c, ["--team" as string]: c }}
      title={`${data.role.title}\n${data.role.credentials}`}>
      <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />
      <div className="bteam" style={{ background: c }}>{data.role.team_name}</div>
      <div className="btitle">{data.role.title.replace(/\s*\(.*\)$/, "")}</div>
      <div className="bmeta">{data.active ? "speaking…" : data.spoke ? `${data.spoke} turn${data.spoke > 1 ? "s" : ""}` : "waiting"}</div>
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />
    </div>
  );
}
const nodeTypes = { expert: ExpertNode };

export function Boardroom({ initialCase, roles, initialTurns, initialOutputs }: {
  initialCase: CaseRow; roles: Role[]; initialTurns: Turn[]; initialOutputs: Output[];
}) {
  const [cs, setCs] = useState(initialCase);
  const [turns, setTurns] = useState(initialTurns);
  const [outs, setOuts] = useState(initialOutputs);
  const [focus, setFocus] = useState<string | null>(null);
  const [ver, setVer] = useState<number | null>(null);
  const [kickMsg, setKickMsg] = useState<string | null>(null);
  const lastKick = useRef(0);
  const roleBy = useMemo(() => new Map(roles.map((r) => [r.code, r])), [roles]);
  const live = ["queued", "running", "waiting"].includes(cs.status);
  const plan = useMemo(() => cs.plan ?? [], [cs.plan]);
  const activeRole = cs.status === "running" ? plan[cs.next_step]?.role ?? null : null;

  const kick = useCallback(async () => {
    lastKick.current = Date.now();
    const { error } = await createClient().functions.invoke("board-ai", { body: { action: "run", case_id: cs.id } });
    setKickMsg(error ? "Could not reach the board service; it will retry automatically." : null);
  }, [cs.id]);

  // Poll while the board is working; restart a paused or crashed run (the server keeps a lock, so double starts are harmless).
  useEffect(() => {
    if (!live) return;
    const sb = createClient();
    let stop = false;
    const tick = async () => {
      const [{ data: c }, { data: t }, { data: o }] = await Promise.all([
        sb.from("board_cases").select("id, status, next_step, plan, last_error, run_lock_until, revision_rounds, title").eq("id", cs.id).single(),
        sb.from("board_turns").select("seq, step, role_code, team_code, kind, addressed_to, summary, content, citations, verdict, created_at").eq("case_id", cs.id).order("seq"),
        sb.from("board_outputs").select("version, title, body_md, dissent, audit_verdict, audit_notes, created_at").eq("case_id", cs.id).order("version"),
      ]);
      if (stop) return;
      if (c) setCs(c as CaseRow);
      if (t) setTurns(t as Turn[]);
      if (o) setOuts(o as Output[]);
      if (!c) return;
      const since = Date.now() - lastKick.current;
      const lockGone = !c.run_lock_until || Date.parse(c.run_lock_until) < Date.now();
      const resting = /resting/.test(c.last_error ?? "");
      if (c.status === "queued" && since > 15_000) void kick();
      else if (c.status === "waiting" && since > (resting ? 300_000 : 20_000)) void kick();
      else if (c.status === "running" && lockGone && since > 30_000) void kick();
    };
    void tick();
    const iv = setInterval(tick, 3000);
    return () => { stop = true; clearInterval(iv); };
  }, [live, cs.id, kick]);

  // Layout: lead in the centre, everyone else on a ring grouped by team.
  const { nodes, edges } = useMemo(() => {
    const order = [...new Set(plan.map((s) => s.role))];
    const lead = order[0];
    const ring = order.filter((r) => r !== lead).sort((a, b) => (roleBy.get(a)?.team_code ?? "").localeCompare(roleBy.get(b)?.team_code ?? ""));
    const R = Math.max(230, ring.length * 46);
    const spoke = new Map<string, number>();
    for (const t of turns) spoke.set(t.role_code, (spoke.get(t.role_code) ?? 0) + 1);
    const ns: Node<NData>[] = [];
    const mk = (code: string, x: number, y: number) => { const role = roleBy.get(code); if (!role) return;
      ns.push({ id: code, type: "expert", position: { x, y }, data: { role, active: code === activeRole, spoke: spoke.get(code) ?? 0, selected: focus === code } }); };
    if (lead) mk(lead, 0, 0);
    ring.forEach((code, i) => { const a = (2 * Math.PI * i) / ring.length - Math.PI / 2; mk(code, Math.cos(a) * R, Math.sin(a) * R * 0.72); });
    const last = turns.at(-1)?.seq;
    const es: Edge[] = [];
    for (const t of turns) for (const to of t.addressed_to) {
      if (to === t.role_code || !roleBy.has(to)) continue;
      const isLast = t.seq === last; const c = TEAM_COLOR[t.team_code] ?? "#64748b";
      es.push({ id: `${t.seq}-${to}`, source: t.role_code, target: to, animated: isLast, label: isLast ? `#${t.seq} ${KIND_LABEL[t.kind] ?? t.kind}` : undefined,
        style: { stroke: c, strokeWidth: isLast ? 2.5 : 1.2, opacity: isLast ? 1 : focus && focus !== t.role_code && focus !== to ? 0.08 : 0.35 },
        markerEnd: { type: MarkerType.ArrowClosed, color: c }, data: { seq: t.seq } });
    }
    return { nodes: ns, edges: es };
  }, [plan, turns, roleBy, activeRole, focus]);

  const shown = focus ? turns.filter((t) => t.role_code === focus || t.addressed_to.includes(focus)) : turns;
  const doc = outs.find((o) => o.version === ver) ?? outs.at(-1);
  const final = outs.filter((o) => o.audit_verdict).at(-1);
  const progress = plan.length ? Math.min(100, Math.round((Math.min(cs.next_step, plan.length) / plan.length) * 100)) : 0;

  function download() {
    if (!doc) return;
    const blob = new Blob([doc.body_md], { type: "text/markdown;charset=utf-8" });
    const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: `${doc.title.replace(/[^\w\- ]+/g, "").slice(0, 80) || "document"} v${doc.version}.md` });
    a.click(); URL.revokeObjectURL(a.href);
  }

  return (
    <>
      <div className="card row no-print" data-testid="board-status">
        <div className="grow">
          <span className={`badge ${cs.status === "approved" ? "ok" : cs.status === "awaiting_approval" ? "warn" : ""}`}>{STATUS_LABEL[cs.status] ?? cs.status}</span>{" "}
          {live && <span className="small">step {Math.min(cs.next_step + 1, plan.length || 1)} of {plan.length || "…"}{activeRole ? ` · ${roleBy.get(activeRole)?.title ?? activeRole} is working` : ""}</span>}
          {cs.revision_rounds > 0 && <span className="small muted"> · revision round {cs.revision_rounds}</span>}
          {live && <div className="bprog"><div style={{ width: `${progress}%` }} /></div>}
          {cs.last_error && <div className="small muted" style={{ marginTop: 6 }}>{cs.last_error}</div>}
          {kickMsg && <div className="small muted">{kickMsg}</div>}
        </div>
        {cs.status === "waiting" && <button type="button" className="secondary" onClick={() => void kick()}>Resume now</button>}
      </div>

      <h2 className="no-print">The boardroom</h2>
      <p className="muted small no-print">Each box is an expert; arrows show who addressed whom. The latest exchange is animated. Click an expert to follow only their conversation.</p>
      <div className="board-flow no-print" data-testid="boardroom">
        <ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} fitView fitViewOptions={{ padding: 0.25 }} minZoom={0.3} maxZoom={1.5}
          nodesDraggable={false} nodesConnectable={false} panOnScroll proOptions={{ hideAttribution: true }}
          onNodeClick={(_, n) => setFocus((f) => (f === n.id ? null : n.id))}
          onEdgeClick={(_, e) => document.getElementById(`turn-${(e.data as { seq: number }).seq}`)?.scrollIntoView({ behavior: "smooth", block: "center" })}>
          <Background gap={24} />
          <Controls showInteractive={false} />
        </ReactFlow>
      </div>
      {focus && <p className="small no-print">Showing {roleBy.get(focus)?.title}. <button type="button" className="linklike" onClick={() => setFocus(null)}>Show everyone</button></p>}

      <div className="board-cols">
        <section className="no-print">
          <h2>Discussion ({turns.length})</h2>
          {!shown.length && <p className="muted">{live ? "The lead expert is preparing the first draft…" : "No turns."}</p>}
          {shown.map((t) => { const r = roleBy.get(t.role_code); const c = TEAM_COLOR[t.team_code] ?? "#64748b"; return (
            <article key={t.seq} id={`turn-${t.seq}`} className="card bturn" style={{ borderLeftColor: c }} data-testid="board-turn">
              <div className="small"><strong>#{t.seq} {r?.title ?? t.role_code}</strong> <span className="muted">· {r?.team_name} · {KIND_LABEL[t.kind] ?? t.kind}
                {t.addressed_to.length ? ` → ${t.addressed_to.map((x) => roleBy.get(x)?.title.replace(/\s*\(.*\)$/, "") ?? x).join(", ")}` : ""}</span>
                {t.verdict && <span className={`badge ${t.verdict === "pass" ? "ok" : "warn"}`} style={{ marginLeft: 6 }}>{t.verdict}</span>}</div>
              <p style={{ margin: "6px 0" }}>{t.summary}</p>
              <details><summary className="small">Full contribution{t.citations.length ? ` · sources ${t.citations.join(", ")}` : ""}</summary><Markdown text={t.content} /></details>
            </article>); })}
        </section>

        <section>
          <div className="row no-print"><h2 className="grow">Document</h2>
            {outs.length > 1 && <select aria-label="Version" value={doc?.version ?? ""} onChange={(e) => setVer(Number(e.target.value))}>
              {outs.map((o) => <option key={o.version} value={o.version}>v{o.version}{o.audit_verdict ? ` (audited: ${o.audit_verdict})` : ""}</option>)}</select>}
            {doc && <button type="button" className="secondary" onClick={download}>Download .md</button>}
            {doc && <button type="button" className="secondary" onClick={() => window.print()}>Print / PDF</button>}</div>
          {final && doc?.version === final.version && (
            <div className={`notice ${final.audit_verdict === "pass" ? "ok" : "error"} no-print`}>
              Final audit: <strong>{final.audit_verdict}</strong>{final.audit_notes ? <details><summary className="small">Audit notes</summary><Markdown text={final.audit_notes} /></details> : null}
            </div>)}
          {doc?.dissent && <div className="notice no-print"><strong>Unresolved disagreement:</strong> <Markdown text={doc.dissent} /></div>}
          {doc ? <div className="card print-doc" data-testid="board-document"><Markdown text={doc.body_md} /></div>
            : <p className="muted">{live ? "The first draft appears here as soon as the lead expert finishes." : "No document."}</p>}
          <p className="muted small no-print">AI-drafted by the expert board for review. Placeholders marked [TO CONFIRM …] and [proposed — confirm] must be completed; legal, tax and secretarial text must be checked by a qualified professional before use.</p>
        </section>
      </div>
    </>
  );
}
