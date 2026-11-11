import Link from "next/link";
import { requireMembership } from "@/lib/session";

const ASSIGNMENT_LABEL: Record<string, string> = {
  invited: "Not started", accepted: "Not started", in_progress: "In progress", completed: "Completed",
  declined: "Declined", expired: "Expired", cancelled: "Cancelled",
};

export default async function CompanyHome({ params }: { params: Promise<{ companyId: string }> }) {
  const { companyId } = await params;
  const { supabase, membership, permissions } = await requireMembership(companyId);

  const [{ data: assignments }, { data: processes }] = await Promise.all([
    supabase
      .from("interview_assignments")
      .select("id, status, due_on, department_id, process_id, interview_campaigns(name, purpose, due_on), departments(name), processes(code, name)")
      .eq("company_id", companyId)
      .eq("respondent_membership_id", membership.id)
      .order("created_at", { ascending: false }),
    permissions.has("dashboard.read")
      ? supabase.from("dashboard_process_status").select("*").eq("company_id", companyId).order("process_code")
      : Promise.resolve({ data: null }),
  ]);

  const canManage = permissions.has("interview.manage");
  const canAdmin = ["org.manage", "membership.manage", "role.manage", "process.edit"].some((x) => permissions.has(x));

  return (
    <>
      <h1>{membership.companies?.name}</h1>
      <p className="muted">{membership.job_title ?? "Member"}</p>

      {(canManage || canAdmin) && (
        <div className="row">
          {canManage && <Link className="button secondary" href={`/c/${companyId}/discovery`}>Discovery setup</Link>}
          {canAdmin && <Link className="button secondary" href={`/c/${companyId}/admin`}>Administration</Link>}
        </div>
      )}

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
