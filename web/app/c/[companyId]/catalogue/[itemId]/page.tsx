import Link from "next/link";
import { notFound } from "next/navigation";
import { requireMembership } from "@/lib/session";
import { fmtDate, memberNames } from "@/lib/names";
import { BASIS_LABEL, CLASS_HELP, CLASS_LABEL, DOC_STATUS_LABEL, GAP_LABEL, GAP_TONE, KIND_LABEL, PROCESS_LABEL } from "@/lib/catalogue-ui";
import { STATUS_LABEL as BOARD_STATUS } from "@/lib/board-ui";
import { compareDescriptions, type DescStep } from "@/lib/compare";
import { decideClassification, draftWithBoard, improveWithBoard, linkSource, requestClassification, setStatus, unlinkSource } from "../actions";

export default async function CatalogueItemPage({ params, searchParams }: {
  params: Promise<{ companyId: string; itemId: string }>; searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { companyId, itemId } = await params;
  const sp = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(itemId)) notFound();
  const { supabase, permissions } = await requireMembership(companyId);
  const { data: it } = await supabase.from("catalogue_gaps").select("*").eq("company_id", companyId).eq("id", itemId).maybeSingle();
  if (!it) notFound();
  const canManage = permissions.has("catalogue.manage");
  const canApprove = permissions.has("catalogue.approve");
  const canStatus = canManage || permissions.has("process.edit");
  const canDraft = permissions.has("document.draft") || permissions.has("org.manage");
  const canReview = permissions.has("interview.review") || permissions.has("process.edit") || permissions.has("org.manage");
  const [{ data: history }, { data: dprocs }, { data: bcase }, { data: dept }] = await Promise.all([
    supabase.from("catalogue_classification_requests").select("*").eq("company_id", companyId).eq("item_id", itemId).order("requested_at", { ascending: false }),
    canStatus ? supabase.from("discovered_processes").select("id, name, session_id").eq("company_id", companyId).neq("status", "removed").order("name").limit(300)
      : Promise.resolve({ data: [] as { id: string; name: string; session_id: string }[] }),
    it.board_case_id ? supabase.from("board_cases").select("id, status, title").eq("id", it.board_case_id).maybeSingle() : Promise.resolve({ data: null }),
    it.department_id ? supabase.from("departments").select("code, name").eq("id", it.department_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const [{ data: srcRows }, { data: counts }] = await Promise.all([
    supabase.from("catalogue_item_sources").select("discovered_process_id, method, linked_by, linked_at").eq("company_id", companyId).eq("item_id", itemId).order("linked_at"),
    supabase.rpc("catalogue_source_counts", { p_company: companyId }),
  ]);
  const srcIds = (srcRows ?? []).map((r) => r.discovered_process_id as string);
  const { data: srcProcs } = srcIds.length
    ? await supabase.from("discovered_processes").select("id, name, session_id, membership_id, purpose, flow").eq("company_id", companyId).in("id", srcIds)
    : { data: [] as { id: string; name: string; session_id: string; membership_id: string; purpose: string | null; flow: unknown }[] };
  const procBy = new Map((srcProcs ?? []).map((d) => [d.id, d]));
  // Who mentioned which step — computed, not AI (same function the expert board uses).
  const persons = [...new Set((srcProcs ?? []).map((d) => d.session_id))];
  const personSteps: DescStep[][] = persons.map((sid) => (srcProcs ?? []).filter((d) => d.session_id === sid).flatMap((d) =>
    (((d.flow as { nodes?: { type: string; label: string; system?: string }[] } | null)?.nodes) ?? []).map((n) => ({ label: n.label, decision: n.type === "decision", system: n.system ?? null }))));
  const matrix = persons.length > 1 ? compareDescriptions(personSteps) : [];
  const totalSources = (counts ?? []).find((c: { item_id: string }) => c.item_id === itemId)?.contributors ?? 0;
  const hiddenSources = Math.max(0, totalSources - srcIds.length);
  const { data: linkedElsewhere } = canStatus ? await supabase.from("catalogue_item_sources").select("discovered_process_id").eq("company_id", companyId) : { data: [] };
  const taken = new Set((linkedElsewhere ?? []).map((r) => r.discovered_process_id as string));
  const linkable = (dprocs ?? []).filter((d) => !taken.has(d.id));
  const { names } = await memberNames(supabase, companyId);
  const personName = persons.map((sid) => { const d = (srcProcs ?? []).find((x) => x.session_id === sid); return d ? names.get(d.membership_id) ?? "A member" : "A member"; });
  const pending = (history ?? []).find((h) => h.status === "pending");

  return (
    <>
      <p><Link href={`/c/${companyId}/catalogue`}>← Catalogue</Link></p>
      <h1>{it.title}</h1>
      <p className="muted">{KIND_LABEL[it.kind]} · {it.code} · {it.function_name}{dept ? ` (owned by ${dept.code} · ${dept.name})` : " (function not yet mapped to a department)"}
        {it.ownership_note && ` · expected owner: ${it.ownership_note}`}{it.source === "blueprint" && " · from the blueprint baseline"}</p>
      {sp.e && <div className="notice error">{sp.e}</div>}
      {sp.ok && <div className="notice ok">{sp.ok}</div>}

      <div className="grid2" style={{ alignItems: "start" }}>
        <section className="card" data-testid="item-summary">
          <div><span className={`badge ${GAP_TONE[it.gap_type] ?? ""}`}>{GAP_LABEL[it.gap_type]}</span></div>
          <dl className="kv small">
            <dt>Classification</dt><dd>{CLASS_LABEL[it.classification]}{it.basis && ` · ${BASIS_LABEL[it.basis] ?? it.basis}`}{it.basis_reference && ` — ${it.basis_reference}`}
              {it.classification_reason && <div className="muted">“{it.classification_reason}” — {names.get(it.classified_by ?? "") ?? "a member"}{it.approved_by && `, approved by ${names.get(it.approved_by) ?? "a member"}`}</div>}</dd>
            <dt>Done today?</dt><dd>{PROCESS_LABEL[it.process_status]}{it.process_note && <div className="muted">{it.process_note}</div>}
              {totalSources > 0 && <div>Described in {totalSources} interview{totalSources === 1 ? "" : "s"} — see below</div>}</dd>
            <dt>Document</dt><dd>{DOC_STATUS_LABEL[it.document_status]}{it.document_note && <div className="muted">{it.document_note}</div>}
              {bcase && <div><Link href={`/c/${companyId}/board/${bcase.id}`}>Expert board draft — {BOARD_STATUS[bcase.status] ?? bcase.status}</Link></div>}</dd>
          </dl>
          {it.description && <p className="small">{it.description}</p>}
          {canDraft && !bcase && it.classification !== "not_applicable" && (
            <form action={draftWithBoard.bind(null, companyId, itemId)}><button type="submit" className="secondary">Draft it with the expert board</button>
              <div className="muted small">One company document from {srcIds.length > 1 ? `all ${srcIds.length} descriptions below` : srcIds.length === 1 ? "the description below" : "what is known about this item"}; facts not given stay as placeholders.</div></form>
          )}
          {canReview && srcIds.length > 0 && (
            <form action={improveWithBoard.bind(null, companyId, itemId)} style={{ marginTop: 8 }}><button type="submit" className="secondary">Ask the expert teams to improve this</button>
              <div className="muted small">Reviews how the company does this work, from {srcIds.length === 1 ? "the description" : `all ${srcIds.length} descriptions`} — not one person&rsquo;s view.</div></form>
          )}
        </section>

        <section>
          {pending && (
            <div className="card" data-testid="pending-here">
              <strong>Waiting for approval:</strong> {CLASS_LABEL[pending.from_class]} → {CLASS_LABEL[pending.to_class]}
              <div className="small">{pending.basis && `${BASIS_LABEL[pending.basis] ?? pending.basis}`}{pending.basis_reference && ` — ${pending.basis_reference}`}</div>
              <p className="small">“{pending.reason}” — {names.get(pending.requested_by) ?? "a member"}</p>
              {canApprove && (
                <form action={decideClassification.bind(null, companyId, pending.id, "item")} className="row" style={{ gap: 6, flexWrap: "wrap" }}>
                  <input type="hidden" name="item" value={itemId} />
                  <input name="note" placeholder="Note (required to reject)" aria-label="Note" />
                  <button type="submit" name="decision" value="approved">Approve</button>
                  <button type="submit" name="decision" value="rejected" className="secondary">Reject</button>
                </form>)}
            </div>)}

          {canManage && !pending && (
            <form action={requestClassification.bind(null, companyId, itemId)} className="card" data-testid="classify-form">
              <strong>Classify</strong>
              <label htmlFor="to">Classification</label>
              <select id="to" name="to" required defaultValue="">
                <option value="" disabled>Choose…</option>
                {["mandatory", "required", "recommended", "not_applicable", "unassessed"].filter((c) => c !== it.classification)
                  .map((c) => <option key={c} value={c}>{CLASS_LABEL[c]} — {CLASS_HELP[c]}</option>)}
              </select>
              <label htmlFor="basis">Basis</label>
              <select id="basis" name="basis" defaultValue="">
                <option value="">(default for the classification)</option>
                {Object.entries(BASIS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
              <label htmlFor="reference">Reference (law, clause, contract or decision — required for Mandatory)</label>
              <input id="reference" name="reference" placeholder="e.g. client agreement with Bank X, clause [to be confirmed]" />
              <label htmlFor="reason">Reason</label>
              <textarea id="reason" name="reason" rows={2} required minLength={10} />
              <button type="submit">Save classification</button>
              <div className="muted small">Mandatory and Not applicable need a second person&rsquo;s approval.</div>
            </form>)}

          {canStatus && (
            <form action={setStatus.bind(null, companyId, itemId)} className="card" data-testid="status-form">
              <strong>What exists today</strong>
              <label htmlFor="process_status">Is this done today?</label>
              <select id="process_status" name="process_status" defaultValue={it.process_status}>{Object.entries(PROCESS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
              <label htmlFor="process_note">How (optional)</label><input id="process_note" name="process_note" defaultValue={it.process_note ?? ""} />
              <label htmlFor="document_status">Is it documented?</label>
              <select id="document_status" name="document_status" defaultValue={it.document_status}>{Object.entries(DOC_STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
              <label htmlFor="document_note">Where / which document (optional)</label><input id="document_note" name="document_note" defaultValue={it.document_note ?? ""} />
              <button type="submit" className="secondary">Save status</button>
            </form>)}
        </section>
      </div>

      <h2>What people said</h2>
      <section data-testid="sources">
        <p className="muted small">Everyone who describes this work in their interview is linked here. Drafts and improvement reviews use all of them together:
          what everyone agrees on becomes the company procedure once; differences are listed for the process owner to settle.</p>
        {!totalSources && <p className="muted">Nobody has described this in an interview yet.</p>}
        {srcIds.length > 0 && (
          <div className="table-wrap"><table className="wrap" data-testid="sources-table">
            <thead><tr><th>Described as</th><th>By</th><th>Linked</th>{canStatus && <th></th>}</tr></thead>
            <tbody>{(srcRows ?? []).map((r) => { const d = procBy.get(r.discovered_process_id); return (
              <tr key={r.discovered_process_id}>
                <td>{d ? <Link href={`/c/${companyId}/work/${d.session_id}#p-${d.id}`}>{d.name}</Link> : "Interview process"}{d?.purpose && <div className="small muted">{d.purpose}</div>}</td>
                <td className="small">{d ? names.get(d.membership_id) ?? "a member" : "—"}</td>
                <td className="small">{fmtDate(r.linked_at)}{r.method === "suggested" && " · from a suggestion"}</td>
                {canStatus && <td><form action={unlinkSource.bind(null, companyId, itemId)}><input type="hidden" name="discovered" value={r.discovered_process_id} />
                  <button type="submit" className="secondary small">Remove</button></form></td>}
              </tr>); })}</tbody>
          </table></div>)}
        {matrix.length > 0 && (
          <details className="card" open data-testid="side-by-side">
            <summary><strong>Side by side — who does which step</strong> <span className="muted small">({matrix.filter((r) => !r.everyone).length} of {matrix.length} steps differ)</span></summary>
            <p className="muted small">Computed by the platform from each person&rsquo;s own process map (not by the AI). Each row is one step of the work; a dash means that person
              did not mention it. Rows marked <span className="badge part">differs</span> are for the process owner to settle. Matching is by wording — check rows that look merged or split.</p>
            <div className="table-wrap"><table className="wrap small">
              <thead><tr><th>#</th>{personName.map((n, k) => <th key={k}>{n}</th>)}<th></th></tr></thead>
              <tbody>{matrix.map((r, k) => (
                <tr key={k}><td className="num">{k + 1}</td>
                  {r.steps.map((st, d) => <td key={d}>{st ? (st.decision ? <em>{st.label}</em> : st.label) : <span className="muted">—</span>}</td>)}
                  <td>{r.everyone ? <span className="badge ok">all</span> : <span className="badge part">differs</span>}</td></tr>))}</tbody>
            </table></div>
          </details>)}
        {hiddenSources > 0 && <p className="muted small">{hiddenSources} more description{hiddenSources === 1 ? " is" : "s are"} in interviews you cannot open; they are still part of this item.</p>}
        {canStatus && linkable.length > 0 && (
          <form action={linkSource.bind(null, companyId)} className="row card" style={{ gap: 6, flexWrap: "wrap" }} data-testid="link-source">
            <input type="hidden" name="item" value={itemId} /><input type="hidden" name="back" value="item" />
            <select name="discovered" required defaultValue="" aria-label="Interview description to add" style={{ maxWidth: 360 }}>
              <option value="" disabled>Add an interview description…</option>
              {linkable.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
            <button type="submit" className="secondary">Add to this item</button>
          </form>)}
      </section>

      <h2>Classification history</h2>
      {!history?.length ? <p className="muted">No classification yet.</p> : (
        <div className="table-wrap"><table className="wrap" data-testid="history">
          <thead><tr><th>When</th><th>Change</th><th>Reason</th><th>Outcome</th></tr></thead>
          <tbody>{history.map((h) => (
            <tr key={h.id}>
              <td className="small">{fmtDate(h.requested_at)}</td>
              <td className="small">{CLASS_LABEL[h.from_class]} → {CLASS_LABEL[h.to_class]}{h.basis && ` (${BASIS_LABEL[h.basis] ?? h.basis})`}</td>
              <td className="small">“{h.reason}” — {names.get(h.requested_by) ?? "a member"}</td>
              <td className="small">{h.status === "applied" ? "Applied" : h.status === "pending" ? "Waiting" : `${h.status === "approved" ? "Approved" : "Rejected"} by ${names.get(h.decided_by ?? "") ?? "a member"}${h.decision_note ? ` — ${h.decision_note}` : ""}`}</td>
            </tr>))}</tbody>
        </table></div>)}
    </>
  );
}
