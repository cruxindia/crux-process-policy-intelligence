import Link from "next/link";
import { requireMembership } from "@/lib/session";
import { memberNames } from "@/lib/names";
import { BASIS_LABEL, CLASS_LABEL, DOC_STATUS_LABEL, GAP_LABEL, GAP_ORDER, GAP_TONE, KIND_LABEL, PROCESS_LABEL } from "@/lib/catalogue-ui";
import { addItem, decideClassification, mapFunction } from "./actions";

export default async function CataloguePage({ params, searchParams }: {
  params: Promise<{ companyId: string }>; searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { companyId } = await params;
  const sp = await searchParams;
  const { supabase, permissions } = await requireMembership(companyId);
  const canManage = permissions.has("catalogue.manage");
  const canApprove = permissions.has("catalogue.approve");
  const tab = sp.tab === "functions" ? "functions" : sp.tab === "approvals" ? "approvals" : "items";

  const [{ data: items }, { data: fns }, { data: depts }, { data: pending }] = await Promise.all([
    supabase.from("catalogue_gaps").select("id, kind, code, title, function_id, function_name, classification, pending_class, process_status, document_status, gap_type, status")
      .eq("company_id", companyId).order("code"),
    supabase.from("catalogue_functions").select("id, code, name, department_id, sort_order").eq("company_id", companyId).eq("status", "active").order("sort_order"),
    supabase.from("departments").select("id, code, name").eq("company_id", companyId).eq("status", "active").order("code"),
    supabase.from("catalogue_classification_requests").select("id, item_id, from_class, to_class, basis, basis_reference, reason, requested_by, requested_at")
      .eq("company_id", companyId).eq("status", "pending").order("requested_at"),
  ]);
  const all = (items ?? []).filter((i) => i.status !== "retired");
  const counts = new Map<string, number>();
  for (const i of all) counts.set(i.gap_type, (counts.get(i.gap_type) ?? 0) + 1);
  const shown = all.filter((i) => (!sp.kind || i.kind === sp.kind) && (!sp.fn || i.function_id === sp.fn) && (!sp.gap || i.gap_type === sp.gap)
    && (!sp.q || `${i.code} ${i.title}`.toLowerCase().includes(sp.q.toLowerCase())));
  const itemBy = new Map(all.map((i) => [i.id, i]));
  const { names } = (pending ?? []).length ? await memberNames(supabase, companyId) : { names: new Map<string, string>() };
  const deptName = new Map((depts ?? []).map((d) => [d.id, `${d.code} · ${d.name}`]));
  const perFn = new Map<string, number>(); for (const i of all) perFn.set(i.function_id, (perFn.get(i.function_id) ?? 0) + 1);
  const link = (extra: Record<string, string | undefined>) => {
    const q = new URLSearchParams(Object.entries({ kind: sp.kind, fn: sp.fn, gap: sp.gap, q: sp.q, ...extra }).filter(([, v]) => v) as [string, string][]);
    return `/c/${companyId}/catalogue${q.size ? `?${q}` : ""}`;
  };

  return (
    <>
      <p><Link href={`/c/${companyId}`}>← Back</Link></p>
      <h1>Process & policy catalogue</h1>
      <p className="muted">
        What Crux should have — functions, core processes, enterprise policies and department SOPs — and what exists today. The starting list comes from
        the blueprint and is <strong>not</strong> a statement that anything is legally required: each item is classified by a person, with a reason.
        A missing document is not a missing process: both are tracked separately.
      </p>
      {sp.e && <div className="notice error">{sp.e}</div>}
      {sp.ok && <div className="notice ok">{sp.ok}</div>}

      <div className="row" style={{ flexWrap: "wrap", gap: 8 }} data-testid="gap-summary">
        {GAP_ORDER.filter((g) => counts.get(g)).map((g) => (
          <Link key={g} href={link({ gap: sp.gap === g ? undefined : g })} className={`card stat${sp.gap === g ? " sel" : ""}`} style={{ margin: 0, padding: "8px 12px", textDecoration: "none" }}>
            <div className="small muted">{GAP_LABEL[g]}</div><div style={{ fontSize: "1.4rem", fontWeight: 600 }}>{counts.get(g)}</div>
          </Link>
        ))}
      </div>

      <nav className="tabs" style={{ margin: "16px 0" }}>
        <Link href={`/c/${companyId}/catalogue`} className={tab === "items" ? "on" : ""}>Items ({all.length})</Link>{" · "}
        <Link href={`/c/${companyId}/catalogue?tab=functions`} className={tab === "functions" ? "on" : ""}>Functions ({fns?.length ?? 0})</Link>{" · "}
        <Link href={`/c/${companyId}/catalogue?tab=approvals`} className={tab === "approvals" ? "on" : ""} data-testid="approvals-tab">Waiting for approval ({pending?.length ?? 0})</Link>
      </nav>

      {tab === "items" && (<>
        <form className="row filters" style={{ gap: 8, flexWrap: "wrap" }} method="get">
          <select name="kind" defaultValue={sp.kind ?? ""} aria-label="Type"><option value="">All types</option>{Object.entries(KIND_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
          <select name="fn" defaultValue={sp.fn ?? ""} aria-label="Function"><option value="">All functions</option>{(fns ?? []).map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</select>
          <select name="gap" defaultValue={sp.gap ?? ""} aria-label="Gap"><option value="">Any status</option>{GAP_ORDER.map((g) => <option key={g} value={g}>{GAP_LABEL[g]}</option>)}</select>
          <input name="q" defaultValue={sp.q ?? ""} placeholder="Search" aria-label="Search" style={{ maxWidth: 200 }} />
          <button type="submit" className="secondary">Filter</button>
          {(sp.kind || sp.fn || sp.gap || sp.q) && <Link href={`/c/${companyId}/catalogue`} className="small">Clear</Link>}
        </form>
        <div className="table-wrap">
          <table className="wrap" data-testid="catalogue-table">
            <thead><tr><th>Item</th><th>Function</th><th>Classification</th><th>Done today?</th><th>Document</th><th>Status</th></tr></thead>
            <tbody>
              {shown.map((i) => (
                <tr key={i.id}>
                  <td><span className="muted small">{KIND_LABEL[i.kind]} · {i.code}</span><br /><Link href={`/c/${companyId}/catalogue/${i.id}`}>{i.title}</Link></td>
                  <td className="small">{i.function_name}</td>
                  <td>{CLASS_LABEL[i.classification]}{i.pending_class && <div className="small muted">→ {CLASS_LABEL[i.pending_class]} (awaiting approval)</div>}</td>
                  <td className="small">{PROCESS_LABEL[i.process_status]}</td>
                  <td className="small">{DOC_STATUS_LABEL[i.document_status]}</td>
                  <td><span className={`badge ${GAP_TONE[i.gap_type] ?? ""}`}>{GAP_LABEL[i.gap_type]}</span></td>
                </tr>
              ))}
              {!shown.length && <tr><td colSpan={6} className="muted">Nothing matches.</td></tr>}
            </tbody>
          </table>
        </div>
        {canManage && (
          <details className="card"><summary><strong>Add an item</strong></summary>
            <form action={addItem.bind(null, companyId)} style={{ marginTop: 10 }}>
              <div className="grid2">
                <div><label htmlFor="kind">Type</label><select id="kind" name="kind" defaultValue="process">{Object.entries(KIND_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
                <div><label htmlFor="function">Function</label><select id="function" name="function" required>{(fns ?? []).map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</select></div>
                <div><label htmlFor="code">Code</label><input id="code" name="code" required placeholder="OPS-P06" /></div>
                <div><label htmlFor="owner">Expected owner (optional)</label><input id="owner" name="owner" placeholder="Operations / Finance" /></div>
              </div>
              <label htmlFor="title">Title</label><input id="title" name="title" required minLength={3} maxLength={200} />
              <label htmlFor="description">Description (optional)</label><textarea id="description" name="description" rows={2} />
              <button type="submit">Add</button>
            </form>
          </details>
        )}
      </>)}

      {tab === "functions" && (
        <>
          <p className="muted small">A function is a type of work, not necessarily a department. Map each function to the department that actually owns it today — several functions can share one department. Department heads can then update the status of their own items.</p>
          <div className="table-wrap"><table className="wrap" data-testid="functions-table">
            <thead><tr><th>Function</th><th>Items</th><th>Owning department</th></tr></thead>
            <tbody>{(fns ?? []).map((f) => (
              <tr key={f.id}>
                <td><Link href={`/c/${companyId}/catalogue?fn=${f.id}`}>{f.name}</Link> <span className="muted small">{f.code}</span></td>
                <td className="num">{perFn.get(f.id) ?? 0}</td>
                <td>{canManage ? (
                  <form action={mapFunction.bind(null, companyId)} className="row" style={{ gap: 6 }}>
                    <input type="hidden" name="id" value={f.id} />
                    <select name="department" defaultValue={f.department_id ?? ""} aria-label={`Department for ${f.name}`}>
                      <option value="">— not mapped yet —</option>{(depts ?? []).map((d) => <option key={d.id} value={d.id}>{d.code} · {d.name}</option>)}
                    </select>
                    <button type="submit" className="secondary">Save</button>
                  </form>) : <span className="small">{f.department_id ? deptName.get(f.department_id) : "Not mapped yet"}</span>}</td>
              </tr>))}</tbody>
          </table></div>
        </>
      )}

      {tab === "approvals" && (
        <>
          <p className="muted small">Changes to Mandatory or Not applicable need a second person. Nobody can approve their own request.</p>
          {!pending?.length && <p className="muted">Nothing is waiting.</p>}
          {(pending ?? []).map((r) => { const it = itemBy.get(r.item_id); return (
            <div key={r.id} className="card" data-testid="pending-request">
              <div><Link href={`/c/${companyId}/catalogue/${r.item_id}`}>{it?.title ?? "Item"}</Link> <span className="muted small">{it?.code}</span></div>
              <div className="small">{CLASS_LABEL[r.from_class]} → <strong>{CLASS_LABEL[r.to_class]}</strong>{r.basis && ` · basis: ${BASIS_LABEL[r.basis] ?? r.basis}`}{r.basis_reference && ` — ${r.basis_reference}`}</div>
              <p className="small" style={{ margin: "6px 0" }}>“{r.reason}” <span className="muted">— {names.get(r.requested_by) ?? "a member"}</span></p>
              {canApprove && (
                <form action={decideClassification.bind(null, companyId, r.id, "list")} className="row" style={{ gap: 6, flexWrap: "wrap" }}>
                  <input name="note" placeholder="Note (required to reject)" aria-label="Note" style={{ maxWidth: 320 }} />
                  <button type="submit" name="decision" value="approved">Approve</button>
                  <button type="submit" name="decision" value="rejected" className="secondary">Reject</button>
                </form>
              )}
            </div>); })}
        </>
      )}
    </>
  );
}
