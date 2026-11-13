import Link from "next/link";
import { notFound } from "next/navigation";
import { requireMembership } from "@/lib/session";
import { fmtDate, memberNames } from "@/lib/names";
import { BASIS_LABEL, CLASS_HELP, CLASS_LABEL, DOC_STATUS_LABEL, GAP_LABEL, GAP_TONE, KIND_LABEL, PROCESS_LABEL } from "@/lib/catalogue-ui";
import { STATUS_LABEL as BOARD_STATUS } from "@/lib/board-ui";
import { decideClassification, draftWithBoard, requestClassification, setStatus } from "../actions";

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
  const [{ data: history }, { data: dprocs }, { data: bcase }, { data: dept }] = await Promise.all([
    supabase.from("catalogue_classification_requests").select("*").eq("company_id", companyId).eq("item_id", itemId).order("requested_at", { ascending: false }),
    canStatus ? supabase.from("discovered_processes").select("id, name, session_id").eq("company_id", companyId).neq("status", "removed").order("name").limit(300)
      : Promise.resolve({ data: [] as { id: string; name: string; session_id: string }[] }),
    it.board_case_id ? supabase.from("board_cases").select("id, status, title").eq("id", it.board_case_id).maybeSingle() : Promise.resolve({ data: null }),
    it.department_id ? supabase.from("departments").select("code, name").eq("id", it.department_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const { names } = await memberNames(supabase, companyId);
  const linked = (dprocs ?? []).find((d) => d.id === it.discovered_process_id);
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
              {linked && <div><Link href={`/c/${companyId}/work/${linked.session_id}#p-${linked.id}`}>From an interview: {linked.name}</Link></div>}</dd>
            <dt>Document</dt><dd>{DOC_STATUS_LABEL[it.document_status]}{it.document_note && <div className="muted">{it.document_note}</div>}
              {bcase && <div><Link href={`/c/${companyId}/board/${bcase.id}`}>Expert board draft — {BOARD_STATUS[bcase.status] ?? bcase.status}</Link></div>}</dd>
          </dl>
          {it.description && <p className="small">{it.description}</p>}
          {canDraft && it.kind !== "process" && !bcase && it.classification !== "not_applicable" && (
            <form action={draftWithBoard.bind(null, companyId, itemId)}><button type="submit" className="secondary">Draft it with the expert board</button>
              <div className="muted small">Opens a drafting case with what is known about this item; facts not given stay as placeholders.</div></form>
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
              <label htmlFor="discovered_process">Described in an interview as (optional)</label>
              <select id="discovered_process" name="discovered_process" defaultValue={it.discovered_process_id ?? ""}>
                <option value="">—</option>{(dprocs ?? []).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
              <label htmlFor="document_status">Is it documented?</label>
              <select id="document_status" name="document_status" defaultValue={it.document_status}>{Object.entries(DOC_STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
              <label htmlFor="document_note">Where / which document (optional)</label><input id="document_note" name="document_note" defaultValue={it.document_note ?? ""} />
              <button type="submit" className="secondary">Save status</button>
            </form>)}
        </section>
      </div>

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
