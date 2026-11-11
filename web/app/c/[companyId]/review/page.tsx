import Link from "next/link";
import { notFound } from "next/navigation";
import { requireMembership } from "@/lib/session";
import { memberNames, fmtDate } from "@/lib/names";

const LABEL: Record<string, string> = { submitted: "Waiting for review", review_pending: "Review in progress", reviewed: "Reviewed", reopened: "Sent back", closed: "Closed", in_progress: "Answering" };

export default async function ReviewQueue({ params }: { params: Promise<{ companyId: string }> }) {
  const { companyId } = await params;
  const { supabase, permissions } = await requireMembership(companyId);
  if (!permissions.has("interview.review")) notFound();
  const [{ data: sessions }, { names }] = await Promise.all([
    supabase.from("interview_sessions")
      .select("id, status, submitted_at, started_at, interview_assignments(respondent_membership_id, interview_campaigns(name))")
      .eq("company_id", companyId).order("submitted_at", { ascending: false, nullsFirst: false }),
    memberNames(supabase, companyId),
  ]);
  const groups = [
    { title: "Waiting for review", rows: (sessions ?? []).filter((s) => ["submitted", "review_pending"].includes(s.status)) },
    { title: "Still answering or sent back", rows: (sessions ?? []).filter((s) => ["in_progress", "reopened"].includes(s.status)) },
    { title: "Reviewed", rows: (sessions ?? []).filter((s) => ["reviewed", "closed"].includes(s.status)) },
  ];
  return (
    <>
      <p><Link href={`/c/${companyId}`}>← Back</Link></p>
      <h1>Review answers</h1>
      <p className="muted">Turn answers into company knowledge (always linked to the answer it came from), ask follow-up questions, and mark each interview reviewed.</p>
      {groups.map((g) => (
        <div key={g.title}>
          <h2>{g.title} ({g.rows.length})</h2>
          {g.rows.length === 0 ? <p className="muted small">None.</p> : (
            <div className="table-wrap"><table><thead><tr><th>Person</th><th>Campaign</th><th>Status</th><th>Submitted</th><th></th></tr></thead><tbody>
              {g.rows.map((s) => (
                <tr key={s.id}>
                  <td>{names.get(s.interview_assignments?.respondent_membership_id ?? "") ?? "—"}</td>
                  <td>{s.interview_assignments?.interview_campaigns?.name ?? ""}</td>
                  <td><span className={`badge ${s.status === "reviewed" ? "ok" : s.status === "submitted" ? "warn" : ""}`}>{LABEL[s.status] ?? s.status}</span></td>
                  <td className="small">{fmtDate(s.submitted_at)}</td>
                  <td><Link href={`/c/${companyId}/review/${s.id}`}>Open</Link></td>
                </tr>
              ))}
            </tbody></table></div>
          )}
        </div>
      ))}
    </>
  );
}
