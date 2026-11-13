import Link from "next/link";
import { requireMembership } from "@/lib/session";
import { fmtDate } from "@/lib/names";
import { markRead } from "./requests/actions";

const ASSIGNMENT_LABEL: Record<string, string> = {
  invited: "Not started", accepted: "Not started", in_progress: "In progress", completed: "Completed",
  declined: "Declined", expired: "Expired", cancelled: "Cancelled",
};

export default async function CompanyHome({ params }: { params: Promise<{ companyId: string }> }) {
  const { companyId } = await params;
  const { supabase, membership, permissions } = await requireMembership(companyId);

  await supabase.rpc("my_discovery_assignment", { p_company: companyId }); // idempotent: existing members get the conversation too
  const [{ data: assignments }, { data: processes }, { data: notes }, { data: forMe }] = await Promise.all([
    supabase
      .from("interview_assignments")
      .select("id, status, due_on, department_id, process_id, interview_campaigns(name, purpose, due_on, interview_mode), departments(name), processes(code, name), interview_sessions(id)")
      .eq("company_id", companyId)
      .eq("respondent_membership_id", membership.id)
      .order("created_at", { ascending: false }),
    permissions.has("dashboard.read")
      ? supabase.from("dashboard_process_status").select("*").eq("company_id", companyId).order("process_code")
      : Promise.resolve({ data: null }),
    supabase.from("notifications").select("id, title, object_type, object_id, created_at").eq("company_id", companyId)
      .eq("recipient_membership_id", membership.id).is("read_at", null).order("created_at", { ascending: false }).limit(20),
    supabase.from("clarification_tasks").select("id, code, question_text, due_at").eq("company_id", companyId)
      .eq("assignee_membership_id", membership.id).in("status", ["open", "assigned", "escalated"]).order("created_at"),
  ]);
  const link = (t: string | null, id: string | null) => t === "dispute" ? `/c/${companyId}/disputes/${id}` : `/c/${companyId}/requests/${id}`;

  const canManage = permissions.has("interview.manage");
  const canAdmin = ["org.manage", "membership.manage", "role.manage", "process.edit"].some((x) => permissions.has(x));
  const canReview = permissions.has("interview.review");
  const canBoard = ["document.draft", "document.read", "interview.review", "process.edit", "org.manage"].some((x) => permissions.has(x));

  return (
    <>
      <h1>{membership.companies?.name}</h1>
      <p className="muted">{membership.job_title ?? "Member"}</p>

      <div className="row">
        {canReview && <Link className="button" href={`/c/${companyId}/review`}>Review answers</Link>}
        <Link className="button secondary" href={`/c/${companyId}/requests`}>Questions &amp; disputes</Link>
        {canManage && <Link className="button secondary" href={`/c/${companyId}/discovery`}>Discovery setup</Link>}
        {canBoard && <Link className="button secondary" href={`/c/${companyId}/board`}>Expert board</Link>}
        <Link className="button secondary" href={`/c/${companyId}/catalogue`}>Catalogue</Link>
        {canAdmin && <Link className="button secondary" href={`/c/${companyId}/admin`}>Administration</Link>}
      </div>

      {!!notes?.length && (
        <div className="card">
          <div className="row" style={{ justifyContent: "space-between" }}><strong>🔔 {notes.length} new</strong>
            <form action={markRead.bind(null, companyId)}><button type="submit" className="secondary" style={{ padding: "2px 10px" }}>Mark all read</button></form></div>
          <ul style={{ margin: "8px 0 0" }}>{notes.map((n) => <li key={n.id}><Link href={link(n.object_type, n.object_id)}>{n.title}</Link> <span className="muted small">{fmtDate(n.created_at)}</span></li>)}</ul>
        </div>
      )}

      {!!forMe?.length && (<>
        <h2>Questions waiting for your reply ({forMe.length})</h2>
        {forMe.map((t) => (
          <div key={t.id} className="card row">
            <div className="grow">{t.question_text}<div className="muted small">{t.code}{t.due_at ? ` · reply by ${fmtDate(t.due_at)}` : ""}</div></div>
            <Link className="button" href={`/c/${companyId}/requests/${t.id}`}>Reply</Link>
          </div>
        ))}
      </>)}

      {(() => {
        const d = assignments?.find((a) => a.interview_campaigns?.interview_mode === "discovery" && !["declined", "expired", "cancelled"].includes(a.status));
        if (!d) return null;
        const sid = d.interview_sessions?.[0]?.id;
        const done = d.status === "completed";
        return (
          <div className="card hero" data-testid="discovery-card">
            <h2 style={{ marginTop: 0 }}>Let&rsquo;s understand the work you do.</h2>
            <p className="muted">A guided conversation about your role, your responsibilities and the work you handle. Just explain your work naturally — the AI organises it into your profile, activities and process maps.</p>
            <div className="row">
              {!done && <Link className="button" href={`/c/${companyId}/interviews/${d.id}`}>{sid ? "Continue conversation" : "Start conversation"}</Link>}
              {sid && <Link className={done ? "button" : "button secondary"} href={`/c/${companyId}/work/${sid}`}>What we understood</Link>}
              {done && <span className="badge ok">Submitted</span>}
            </div>
          </div>
        );
      })()}

      <h2>My interviews</h2>
      {!assignments?.length && <p className="muted">No interviews are assigned to you.</p>}
      {assignments?.map((a) => (
        <div key={a.id} className="card row">
          <div className="grow">
            <strong>{a.interview_campaigns?.name ?? "Interview"}</strong>{" "}
            <span className={`badge ${a.status === "completed" ? "ok" : a.status === "in_progress" ? "warn" : ""}`}>
              {ASSIGNMENT_LABEL[a.status] ?? a.status}
            </span>
            <div className="muted small">
              {a.processes ? `Process ${a.processes.code} · ${a.processes.name}` : `Department · ${a.departments?.name ?? ""}`}
              {(a.due_on ?? a.interview_campaigns?.due_on) && ` · due ${a.due_on ?? a.interview_campaigns?.due_on}`}
            </div>
          </div>
          {["invited", "accepted", "in_progress"].includes(a.status) && (
            <Link className="button" href={`/c/${companyId}/interviews/${a.id}`}>
              {a.status === "in_progress" ? "Resume" : "Start"}
            </Link>
          )}
          {a.status === "completed" && <Link href={`/c/${companyId}/interviews/${a.id}`}>View</Link>}
          {a.interview_campaigns?.interview_mode === "discovery" && a.interview_sessions?.[0] && (
            <Link href={`/c/${companyId}/work/${a.interview_sessions[0].id}`}>What we understood</Link>
          )}
        </div>
      ))}

      {processes && (
        <>
          <h2>Process status</h2>
          <p className="muted small">Only processes you are permitted to read are counted.</p>
          {processes.length === 0 ? <p className="muted">No processes recorded yet.</p> : (
            <div className="table-wrap">
              <table>
                <thead><tr>
                  <th>Process</th><th>Status</th><th>Latest version</th>
                  <th className="num">Pending review</th><th className="num">Verified</th><th className="num">Open hypotheses</th>
                  <th className="num">Open clarifications</th><th className="num">Open disputes</th><th className="num">Docs published</th>
                </tr></thead>
                <tbody>
                  {processes.map((p) => (
                    <tr key={p.process_id}>
                      <td>{p.process_code} · {p.process_name}</td>
                      <td>{p.process_status}</td>
                      <td>{p.latest_version_no ? `v${p.latest_version_no} ${p.latest_version_kind} (${p.latest_version_status})` : "—"}</td>
                      <td className="num">{p.knowledge_pending_review}</td>
                      <td className="num">{p.knowledge_verified}</td>
                      <td className="num">{p.open_hypotheses}</td>
                      <td className="num">{p.open_clarifications}{p.overdue_clarifications ? ` (${p.overdue_clarifications} overdue)` : ""}</td>
                      <td className="num">{p.open_disputes}</td>
                      <td className="num">{p.documents_published}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </>
  );
}
