import Link from "next/link";
import { requireMembership } from "@/lib/session";
import { memberNames, fmtDate } from "@/lib/names";
import { createRequest } from "./actions";

type Row = { id: string; code: string; question_text: string; status: string; due_at: string | null; requester_membership_id: string; assignee_membership_id: string | null };

function List({ rows, who, companyId, names }: { rows: Row[]; who: "from" | "to" | "both"; companyId: string; names: Map<string, string> }) {
  if (rows.length === 0) return <p className="muted small">None.</p>;
  return (
    <div className="table-wrap"><table><thead><tr><th>Ref</th><th>Question</th>{who !== "to" && <th>From</th>}{who !== "from" && <th>To</th>}<th>Status</th><th>Due</th></tr></thead><tbody>
      {rows.map((t) => (
        <tr key={t.id}>
          <td><Link href={`/c/${companyId}/requests/${t.id}`}>{t.code}</Link></td>
          <td style={{ whiteSpace: "normal", minWidth: 220 }}>{t.question_text.slice(0, 120)}</td>
          {who !== "to" && <td>{names.get(t.requester_membership_id) ?? "—"}</td>}
          {who !== "from" && <td>{t.assignee_membership_id ? names.get(t.assignee_membership_id) : "Department"}</td>}
          <td><span className={`badge ${t.status === "resolved" ? "ok" : ["assigned", "open"].includes(t.status) ? "warn" : ""}`}>{ST[t.status] ?? t.status}</span></td>
          <td className="small">{fmtDate(t.due_at)}</td>
        </tr>
      ))}
    </tbody></table></div>
  );
}

const ST: Record<string, string> = { open: "Open", assigned: "Waiting for reply", response_submitted: "Replied", resolved: "Resolved", escalated: "Escalated", disputed: "In dispute", cancelled: "Cancelled" };

export default async function Requests({ params, searchParams }: { params: Promise<{ companyId: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { companyId } = await params;
  const sp = await searchParams;
  const { supabase, membership, permissions } = await requireMembership(companyId);
  const [{ data: tasks }, { names, members }, { data: deps }, { data: procs }, { data: disputes }] = await Promise.all([
    supabase.from("clarification_tasks").select("id, code, question_text, status, due_at, requester_membership_id, assignee_membership_id, created_at")
      .eq("company_id", companyId).order("created_at", { ascending: false }).limit(200),
    memberNames(supabase, companyId),
    supabase.from("departments").select("id, code, name").eq("company_id", companyId).eq("status", "active").order("code"),
    supabase.from("processes").select("id, code, name").eq("company_id", companyId).order("code"),
    supabase.from("disputes").select("id, code, issue_statement, status, decision_owner_membership_id").eq("company_id", companyId).order("created_at", { ascending: false }),
  ]);
  const mine = (tasks ?? []).filter((t) => t.assignee_membership_id === membership.id);
  const raised = (tasks ?? []).filter((t) => t.requester_membership_id === membership.id);
  const others = (tasks ?? []).filter((t) => t.assignee_membership_id !== membership.id && t.requester_membership_id !== membership.id);
  const canCreate = permissions.has("clarification.create");

  return (
    <>
      <p><Link href={`/c/${companyId}`}>← Back</Link></p>
      <h1>Questions &amp; disputes</h1>
      {sp.e && <div className="notice error">{sp.e}</div>}
      <h2>Questions for me ({mine.filter((t) => ["open", "assigned", "escalated"].includes(t.status)).length} waiting)</h2>
      <List rows={mine} who="from" companyId={companyId} names={names} />
      {raised.length > 0 && <><h2>Questions I asked</h2><List rows={raised} who="to" companyId={companyId} names={names} /></>}
      {others.length > 0 && <><h2>Other questions I can see</h2><List rows={others} who="both" companyId={companyId} names={names} /></>}
      {(disputes ?? []).length > 0 && (<>
        <h2>Disputes</h2>
        <ul>{disputes!.map((d) => <li key={d.id}><Link href={`/c/${companyId}/disputes/${d.id}`}>{d.code}</Link> — {d.issue_statement.slice(0, 120)} <span className="badge">{d.status}</span>
          {d.decision_owner_membership_id === membership.id && d.status !== "decided" && <span className="badge warn" style={{ marginLeft: 6 }}>your decision</span>}</li>)}</ul>
      </>)}

      {canCreate && (<>
        <h2>Ask someone a question</h2>
        <form action={createRequest.bind(null, companyId)} className="card grid2">
          <input type="hidden" name="idem" value={`req:${crypto.randomUUID()}`} />
          <div><label htmlFor="r-to">To</label>
            <select id="r-to" name="assignee_membership_id" required>{members.filter((m) => m.id !== membership.id && m.status === "active").map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></div>
          <div><label htmlFor="r-dept">Their department (if different)</label>
            <select id="r-dept" name="assignee_department_id" defaultValue=""><option value="">Their main department</option>{(deps ?? []).map((d) => <option key={d.id} value={d.id}>{d.code} · {d.name}</option>)}</select></div>
          <div><label htmlFor="r-from">On behalf of department</label>
            <select id="r-from" name="requesting_department_id" defaultValue={membership.primary_department_id ?? ""}><option value="">My main department</option>{(deps ?? []).map((d) => <option key={d.id} value={d.id}>{d.code} · {d.name}</option>)}</select></div>
          <div><label htmlFor="r-proc">About process (optional)</label>
            <select id="r-proc" name="process_id" defaultValue=""><option value="">—</option>{(procs ?? []).map((p) => <option key={p.id} value={p.id}>{p.code} · {p.name}</option>)}</select></div>
          <div style={{ gridColumn: "1 / -1" }}><label htmlFor="r-q">Question</label><textarea id="r-q" name="question" required /></div>
          <div style={{ gridColumn: "1 / -1" }}><label htmlFor="r-c">Context (optional)</label><input id="r-c" name="context" /></div>
          <div><label htmlFor="r-due">Reply by</label><input id="r-due" type="date" name="due_on" /></div>
          <div><label htmlFor="r-pri">Priority</label><select id="r-pri" name="priority" defaultValue="normal"><option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option><option value="urgent">Urgent</option></select></div>
          <div><button type="submit">Send question</button></div>
        </form>
      </>)}
    </>
  );
}
