// What the documents say, for one department or all (SOW 12G Q6/Q8): the processes as written today with their flowcharts,
// and every finding — gaps, loose ends, risks with suggested mitigations, missing documents, duplicates and open questions.
// Used by administrators (all departments) and by stakeholders (their department only).
import { ProcessMap, type ProcessFlow } from "@/components/process-map";
import { DEPARTMENTS } from "@/lib/doc-classify";

export type FindingRow = { id: string; kind: string; severity: string; department_code: string | null; title: string; detail: string | null; mitigation: string | null;
  evidence: string | null; status: string; decision_note: string | null; document_id: string | null };
export type DocProcessRow = { id: string; name: string; department_code: string | null; owner_role: string | null; purpose: string | null; trigger_text: string | null;
  flow: unknown; controls: string[]; approvals: string[]; records: string[]; sla: string[]; document_id: string };

export const KIND: Record<string, [string, string]> = {
  gap: ["Gaps", "What the document does not say, or says unclearly"], loose_end: ["Loose ends", "Things it refers to but never defines or provides"],
  risk: ["Risks", "What could go wrong, and a suggested mitigation"], missing_document: ["Missing documents", "Expected for a company like yours, not found"],
  missing_reference: ["Referred to, not provided", "Forms or documents mentioned but not among the files"], duplicate: ["Duplicate versions", "Several versions of the same document"],
  control_field: ["Document control", "Version, owner, approver and review date"], question: ["Questions for the team", "What to confirm with the people who do the work"],
  conflict: ["Conflicts", "Documents that disagree"],
};
const SEV: Record<string, string> = { high: "danger", medium: "warn", low: "" };
const STATUS: Record<string, string> = { open: "Open", confirmed: "Confirmed", rejected: "Not correct", resolved: "Resolved" };

export function FindingsView({ findings, processes, docNames, decide, hidden }: {
  findings: FindingRow[]; processes: DocProcessRow[]; docNames: Map<string, string>;
  decide?: (id: string) => (form: FormData) => Promise<void>; hidden?: Record<string, string>;
}) {
  const kinds = Object.keys(KIND).filter((k) => findings.some((f) => f.kind === k));
  return (
    <>
      {processes.length > 0 && (
        <section className="card" data-testid="asis-processes">
          <h2 style={{ marginTop: 0 }}>How the work is written today ({processes.length})</h2>
          {processes.map((p) => {
            const flow = p.flow as ProcessFlow | null;
            return (
              <details key={p.id} className="asis">
                <summary><strong>{p.name}</strong> <span className="small muted">— {p.department_code ? DEPARTMENTS[p.department_code]?.split(" / ")[0] : "department not stated"}
                  {p.owner_role ? ` · owner: ${p.owner_role}` : " · owner not stated"} · from {docNames.get(p.document_id) ?? "a document"}</span></summary>
                {p.purpose && <p className="small"><strong>Purpose:</strong> {p.purpose}</p>}
                {p.trigger_text && <p className="small"><strong>Starts when:</strong> {p.trigger_text}</p>}
                {flow?.nodes?.length ? <ProcessMap flow={flow} height={360} /> : <p className="small muted">The document does not describe the steps in order.</p>}
                <div className="grid2 small">
                  {([["Controls", p.controls], ["Approvals", p.approvals], ["Records kept", p.records], ["Time limits", p.sla]] as [string, string[]][]).map(([h, xs]) => (
                    <div key={h}><strong>{h}</strong>{xs.length ? <ul>{xs.map((x, i) => <li key={i}>{x}</li>)}</ul> : <p className="muted">None stated</p>}</div>))}
                </div>
              </details>);
          })}
        </section>)}
      {kinds.length === 0 && <p className="muted">No findings yet.</p>}
      {kinds.map((k) => {
        const fs = findings.filter((f) => f.kind === k).sort((a, b) => ["high", "medium", "low"].indexOf(a.severity) - ["high", "medium", "low"].indexOf(b.severity));
        return (
          <section key={k} className="card" data-testid={`findings-${k}`}>
            <h2 style={{ marginTop: 0 }}>{KIND[k]![0]} ({fs.length})</h2>
            <p className="small muted" style={{ marginTop: -6 }}>{KIND[k]![1]}</p>
            <ul className="findings">{fs.map((f) => (
              <li key={f.id} className={f.status !== "open" ? "decided" : undefined}>
                <div className="row" style={{ gap: 6, alignItems: "baseline" }}>
                  {k !== "question" && <span className={`badge ${SEV[f.severity]}`}>{f.severity}</span>}
                  <strong>{f.title}</strong>
                  {f.status !== "open" && <span className="badge ok">{STATUS[f.status]}</span>}
                </div>
                <div className="small muted">{[f.department_code ? DEPARTMENTS[f.department_code]?.split(" / ")[0] : null, f.document_id ? `in ${docNames.get(f.document_id) ?? "a document"}` : null].filter(Boolean).join(" · ")}</div>
                {f.evidence && <blockquote className="small">“{f.evidence}”</blockquote>}
                {f.detail && <p className="small" style={{ whiteSpace: "pre-line" }}>{k === "missing_document" ? <><strong>It should contain:</strong> {f.detail}</> : f.detail}</p>}
                {f.mitigation && <p className="small"><strong>Suggested:</strong> {f.mitigation}</p>}
                {f.decision_note && <p className="small muted">Note: {f.decision_note}</p>}
                {decide && (
                  <form action={decide(f.id)} className="row small" style={{ gap: 6 }}>
                    {Object.entries(hidden ?? {}).map(([n, v]) => <input key={n} type="hidden" name={n} value={v} />)}
                    <input name="note" placeholder={k === "question" ? "Answer or comment" : "Comment (needed for “not correct”)"} maxLength={1000} style={{ flex: "1 1 220px" }} />
                    <button type="submit" name="status" value="confirmed" className="secondary">{k === "question" ? "Answered" : "Correct"}</button>
                    <button type="submit" name="status" value="rejected" className="secondary">Not correct</button>
                    <button type="submit" name="status" value="resolved" className="secondary">Fixed</button>
                  </form>)}
              </li>))}</ul>
          </section>);
      })}
    </>
  );
}
