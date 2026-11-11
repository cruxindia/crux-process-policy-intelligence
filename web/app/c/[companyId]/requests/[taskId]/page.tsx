import Link from "next/link";
import { notFound } from "next/navigation";
import { requireMembership } from "@/lib/session";
import { memberNames, fmtDate } from "@/lib/names";
import { askAgain, cancelRequest, raiseDispute, reply, resolve } from "../actions";

export default async function RequestDetail({ params, searchParams }: { params: Promise<{ companyId: string; taskId: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { companyId, taskId } = await params;
  const sp = await searchParams;
  const { supabase, membership, permissions } = await requireMembership(companyId);
  const { data: t } = await supabase.from("clarification_tasks").select("*").eq("company_id", companyId).eq("id", taskId).maybeSingle();
  if (!t) notFound();
  const [{ data: replies }, { names, members }, { data: dispute }] = await Promise.all([
    supabase.from("clarification_responses").select("id, responder_membership_id, response_text, created_at").eq("company_id", companyId).eq("task_id", taskId).order("created_at"),
    memberNames(supabase, companyId),
    supabase.from("disputes").select("id, code, status").eq("company_id", companyId).eq("clarification_task_id", taskId).maybeSingle(),
  ]);
  const isRequester = t.requester_membership_id === membership.id;
  const isAssignee = t.assignee_membership_id === membership.id;
  const isManager = permissions.has("clarification.manage");
  const closed = ["resolved", "cancelled"].includes(t.status);
  const canReply = !closed && t.status !== "disputed" && (isAssignee || permissions.has("clarification.respond"));

  return (
    <>
      <p><Link href={`/c/${companyId}/requests`}>← Questions &amp; disputes</Link></p>
      <h1>{t.code}</h1>
      <p className="muted">From {names.get(t.requester_membership_id)} to {t.assignee_membership_id ? names.get(t.assignee_membership_id) : "the department"} · {t.status.replace("_", " ")}{t.due_at ? ` · reply by ${fmtDate(t.due_at)}` : ""}</p>
      {sp.e && <div className="notice error">{sp.e}</div>}
      {sp.ok && <div className="notice ok">{sp.ok}</div>}
      <div className="chat">
        <div className="bubble bot"><strong>{t.question_text}</strong>{t.context_text && <div className="muted small" style={{ marginTop: 4 }}>{t.context_text}</div>}
          <div className="muted small" style={{ marginTop: 4 }}>{names.get(t.requester_membership_id)} · {fmtDate(t.created_at)}</div></div>
        {(replies ?? []).map((r) => (
          <div key={r.id} className={`bubble ${r.responder_membership_id === membership.id ? "me" : "bot"}`}>
            <span style={{ whiteSpace: "pre-wrap" }}>{r.response_text}</span>
            <div className="meta small" style={{ opacity: .8, marginTop: 4 }}>{names.get(r.responder_membership_id)} · {fmtDate(r.created_at)}</div>
          </div>
        ))}
        {t.status === "resolved" && <div className="notice ok">Resolved: {t.outcome_text}</div>}
        {dispute && <div className="notice">Escalated to dispute <Link href={`/c/${companyId}/disputes/${dispute.id}`}>{dispute.code}</Link> ({dispute.status}).</div>}
      </div>

      {canReply && (
        <form action={reply.bind(null, companyId, taskId)} className="card">
          <label htmlFor="rep">Your reply</label><textarea id="rep" name="text" required />
          <div style={{ marginTop: 8 }}><button type="submit">Send reply</button></div>
        </form>
      )}
      {(isRequester || isManager) && !closed && t.status !== "disputed" && (
        <div className="card">
          <form action={resolve.bind(null, companyId, taskId)}>
            <label htmlFor="out">Close with an outcome</label>
            <input id="out" name="outcome" required placeholder="What was agreed or learned" />
            <div className="row" style={{ marginTop: 8 }}>
              <button type="submit" disabled={t.status !== "response_submitted"}>Resolve</button>
              {t.status === "response_submitted" && <button type="submit" formAction={askAgain.bind(null, companyId, taskId)} formNoValidate className="secondary">Ask for more detail</button>}
              <button type="submit" formAction={cancelRequest.bind(null, companyId, taskId)} formNoValidate className="secondary">Cancel request</button>
            </div>
          </form>
        </div>
      )}
      {(isRequester || isManager) && !closed && !dispute && permissions.has("dispute.raise") && (
        <details className="card">
          <summary>Answers conflict? Raise a dispute</summary>
          <form action={raiseDispute.bind(null, companyId, taskId, t.assignee_department_id, t.process_id)} style={{ marginTop: 8 }}>
            <label htmlFor="iss">What is disputed?</label><textarea id="iss" name="issue" required placeholder="e.g. Ops says the branch head approves; Finance says Finance head approves." />
            <label htmlFor="imp">Impact (optional)</label><input id="imp" name="impact" />
            <label htmlFor="pos">Your position (optional, can add later)</label><textarea id="pos" name="my_position" />
            <label htmlFor="own">Who decides?</label>
            <select id="own" name="decision_owner" required>{members.filter((m) => m.status === "active" && m.id !== membership.id).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select>
            <p className="muted small">Pick a manager who did not raise the dispute. Only a person can decide; both sides must record a position first.</p>
            <button type="submit">Raise dispute</button>
          </form>
        </details>
      )}
    </>
  );
}
