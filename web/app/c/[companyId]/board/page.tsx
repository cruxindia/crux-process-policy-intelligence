import Link from "next/link";
import { notFound } from "next/navigation";
import { requireMembership } from "@/lib/session";
import { fmtDate } from "@/lib/names";
import { openDocumentCase } from "./actions";
import { DOC_LABEL, STATUS_LABEL } from "@/lib/board-ui";

export default async function BoardPage({ params, searchParams }: {
  params: Promise<{ companyId: string }>; searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { companyId } = await params;
  const sp = await searchParams;
  const { supabase, permissions } = await requireMembership(companyId);
  const canDraft = permissions.has("document.draft") || permissions.has("org.manage");
  const canSee = canDraft || ["document.read", "interview.review", "process.edit"].some((p) => permissions.has(p));
  if (!canSee) notFound();
  const canConfidential = permissions.has("classified.confidential_read") || permissions.has("org.manage");

  const [{ data: cases }, { data: teams }, { data: procs }] = await Promise.all([
    supabase.from("board_cases").select("id, kind, doc_type, title, status, classification, created_at, updated_at").eq("company_id", companyId)
      .order("created_at", { ascending: false }).limit(100),
    supabase.from("agent_teams").select("code, name").eq("company_id", companyId).eq("status", "active").order("sort_order"),
    canDraft ? supabase.from("discovered_processes").select("id, name").eq("company_id", companyId).neq("status", "removed").order("name").limit(200)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
  ]);

  return (
    <>
      <p><Link href={`/c/${companyId}`}>← Back</Link></p>
      <h1>Expert board</h1>
      <p className="muted">
        {(teams ?? []).filter((t) => t.code !== "interview").length} expert teams review processes and draft policies, SOPs, agreements and resolutions together.
        A lead expert drafts, the other disciplines critique, the lead consolidates, the document controller applies the house format and the independent
        auditor gives the final verdict. <strong>Nothing is final until a person approves it.</strong> <Link href={`/c/${companyId}/board/teams`}>Meet the teams →</Link>
      </p>
      {sp.e && <div className="notice error">{sp.e}</div>}

      {canDraft && (
        <details className="card" open={!cases?.length}>
          <summary><strong>Draft a new document</strong></summary>
          <form action={openDocumentCase.bind(null, companyId)} style={{ marginTop: 12 }}>
            <div className="grid2">
              <div><label htmlFor="doc_type">Document type</label>
                <select id="doc_type" name="doc_type" required defaultValue="policy">
                  {Object.entries(DOC_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select></div>
              <div><label htmlFor="classification">Classification</label>
                <select id="classification" name="classification" defaultValue="internal">
                  <option value="internal">Internal</option>
                  {canConfidential && <option value="confidential">Confidential</option>}
                </select></div>
            </div>
            <label htmlFor="title">Title</label>
            <input id="title" name="title" required minLength={3} maxLength={200} placeholder="e.g. Data protection policy for field verification" />
            <label htmlFor="brief">Brief — what it must cover, who it is for, anything already decided</label>
            <textarea id="brief" name="brief" rows={5} maxLength={6000}
              placeholder="e.g. Mutual NDA with a sub-agency doing address verification visits in Maharashtra; they will see applicant names and phone numbers; 2-year term; arbitration in Pune." />
            {!!procs?.length && (
              <details style={{ marginTop: 8 }}>
                <summary className="small">Ground it in discovered processes (optional, up to 10)</summary>
                <div className="small" style={{ maxHeight: 220, overflow: "auto", marginTop: 6 }}>
                  {procs.map((p) => <label key={p.id} style={{ display: "block", fontWeight: 400 }}><input type="checkbox" name="process_ids" value={p.id} /> {p.name}</label>)}
                </div>
              </details>
            )}
            <p className="muted small">Facts come only from your brief and the selected processes; anything missing is left as a [TO CONFIRM] placeholder. The text is sent to the configured AI provider.</p>
            <button type="submit">Start the board</button>
          </form>
        </details>
      )}

      <h2>Cases</h2>
      {!cases?.length ? <p className="muted">No cases yet.{canDraft ? " Start one above, or from a discovered process in the Review Centre." : ""}</p> : (
        <div className="table-wrap">
          <table className="wrap">
            <thead><tr><th>Case</th><th>Type</th><th>Status</th><th>Opened</th></tr></thead>
            <tbody>
              {cases.map((c) => (
                <tr key={c.id}>
                  <td><Link href={`/c/${companyId}/board/${c.id}`}>{c.title}</Link>{c.classification === "confidential" && <span className="badge warn" style={{ marginLeft: 6 }}>Confidential</span>}</td>
                  <td>{c.kind === "improvement_review" ? "Process improvement" : DOC_LABEL[c.doc_type ?? "other"]}</td>
                  <td><span className={`badge ${c.status === "approved" ? "ok" : c.status === "awaiting_approval" ? "warn" : ""}`}>{STATUS_LABEL[c.status] ?? c.status}</span></td>
                  <td className="small">{fmtDate(c.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
