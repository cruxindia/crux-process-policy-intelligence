import Link from "next/link";
import { notFound } from "next/navigation";
import { requireMembership } from "@/lib/session";
import { memberNames, fmtDate } from "@/lib/names";
import { addPosition, decide } from "../../requests/actions";

export default async function DisputeDetail({ params, searchParams }: { params: Promise<{ companyId: string; disputeId: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { companyId, disputeId } = await params;
  const sp = await searchParams;
  const { supabase, membership, permissions } = await requireMembership(companyId);
  const { data: d } = await supabase.from("disputes").select("*").eq("company_id", companyId).eq("id", disputeId).maybeSingle();
  if (!d) notFound();
  const [{ data: positions }, { data: decision }, { names }] = await Promise.all([
    supabase.from("dispute_positions").select("id, participant_membership_id, position_text, context_text, created_at").eq("company_id", companyId).eq("dispute_id", disputeId).order("created_at"),
    supabase.from("dispute_decisions").select("*").eq("company_id", companyId).eq("dispute_id", disputeId).maybeSingle(),
    memberNames(supabase, companyId),
  ]);
  const open = !["decided", "withdrawn"].includes(d.status);
  const mayDecide = open && (d.decision_owner_membership_id === membership.id || permissions.has("dispute.decide"));
  return (
    <>
      <p><Link href={`/c/${companyId}/requests`}>← Questions &amp; disputes</Link></p>
      <h1>Dispute {d.code}</h1>
      <p className="muted">Raised by {names.get(d.raised_by_membership_id)} · decision by {names.get(d.decision_owner_membership_id)} · {d.status}</p>
      {sp.e && <div className="notice error">{sp.e}</div>}
      {sp.ok && <div className="notice ok">{sp.ok}</div>}
      <div className="card"><strong>{d.issue_statement}</strong>{d.impact_text && <p className="muted small">Impact: {d.impact_text}</p>}
        {d.clarification_task_id && <p className="small"><Link href={`/c/${companyId}/requests/${d.clarification_task_id}`}>Original question</Link></p>}</div>
      <h2>Positions ({positions?.length ?? 0})</h2>
      <p className="muted small">Every position is kept permanently — nobody can edit or delete another side&rsquo;s view.</p>
      {(positions ?? []).map((p) => (
        <div key={p.id} className="card"><div className="muted small">{names.get(p.participant_membership_id)} · {fmtDate(p.created_at)}</div>
          <p style={{ whiteSpace: "pre-wrap", margin: "4px 0" }}>{p.position_text}</p>{p.context_text && <p className="muted small">{p.context_text}</p>}</div>
      ))}
      {open && (
        <form action={addPosition.bind(null, companyId, disputeId)} className="card">
          <label htmlFor="pp">Add your position</label><textarea id="pp" name="position" required />
          <label htmlFor="pc">When / where does it apply? (optional)</label><input id="pc" name="context" placeholder="e.g. branch cases below ₹1 lakh" />
          <div style={{ marginTop: 8 }}><button type="submit">Record my position</button></div>
        </form>
      )}
      {decision ? (
        <div className="notice ok"><strong>Decision ({names.get(decision.decided_by_membership_id)}, {fmtDate(decision.decided_at)}):</strong> {decision.decision_text}
          <div className="small">Why: {decision.rationale}</div>{decision.resulting_actions && <div className="small">Actions: {decision.resulting_actions}</div>}</div>
      ) : mayDecide && (
        <form action={decide.bind(null, companyId, disputeId)} className="card">
          <h2 style={{ marginTop: 0 }}>Decide</h2>
          <p className="muted small">Needs at least two recorded positions. Your name is recorded with the decision.</p>
          <label htmlFor="dd">Decision</label><textarea id="dd" name="decision" required />
          <label htmlFor="dr">Rationale</label><textarea id="dr" name="rationale" required />
          <label htmlFor="da">Resulting actions (optional)</label><input id="da" name="actions" />
          <div style={{ marginTop: 8 }}><button type="submit" disabled={(positions?.length ?? 0) < 2}>Record decision</button></div>
        </form>
      )}
    </>
  );
}
