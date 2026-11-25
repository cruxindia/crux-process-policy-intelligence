import { notFound } from "next/navigation";
import { requireMembership } from "@/lib/session";
import { DEPARTMENTS } from "@/lib/doc-classify";
import { Uploader } from "./uploader";
import { adoptBaseline, finalise, removeStakeholder, setCategory, setupDepartments } from "./actions";
import { StakeholderForm } from "./stakeholder-form";
import { Analyse } from "./analyse";

const CAT: Record<string, [string, string]> = { governing: ["Rule document", "ok"], record: ["Record", ""], sensitive: ["Personal / legal — not read", "warn"] };
const AN: Record<string, string> = { not_needed: "—", queued: "Waiting for analysis", running: "Being analysed", done: "Analysed", failed: "Analysis failed", waiting_provider: "Waiting for an approved AI" };
const STATUS: Record<string, string> = { not_assessed: "Not assessed yet", found: "Found", partial: "Partly covered", outdated: "Outdated", missing: "Missing", not_applicable: "Not applicable", extra: "Extra" };

type DeptRow = { code: string; name: string; department_id: string | null; files: number; rule_documents: number; open_findings: number; stakeholders: { membership_id: string; name: string; job_title: string | null }[] };

/** Documents (SOW 12G Q3-Q5): the company's existing documents, read on the uploader's computer, checked against the baseline. */
export default async function Documents({ params, searchParams }: { params: Promise<{ companyId: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { companyId } = await params; const sp = await searchParams;
  const { supabase, permissions } = await requireMembership(companyId);
  if (!permissions.has("org.manage")) notFound();
  const cat = ["governing", "record", "sensitive"].includes(sp.cat ?? "") ? sp.cat! : "governing";
  const [{ data: docs }, { data: list }, { data: versions }, { data: adopted }, { data: reg }, { data: deptRows }, { data: members }] = await Promise.all([
    supabase.from("source_documents").select("category, department_code, read_status, analysis_status").eq("company_id", companyId).limit(20000),
    supabase.from("source_documents").select("id, file_name, folder, category, doc_type, department_code, reason, read_status, unreadable_reason, analysis_status, text_chars")
      .eq("company_id", companyId).eq("category", cat).order("folder").order("file_name").limit(500),
    supabase.from("baseline_versions").select("id, title, version, as_of").eq("status", "active").order("activated_at", { ascending: false }),
    supabase.from("company_baselines").select("version_id").eq("company_id", companyId),
    supabase.from("register_items").select("kind, status").eq("company_id", companyId).limit(5000),
    supabase.rpc("doc_departments", { p_company: companyId }),
    supabase.from("memberships").select("id, user_id").eq("company_id", companyId).eq("status", "active").limit(2000),
  ]);
  // memberships.user_id points at auth.users, so names come from user_profiles in a second lookup (no PostgREST embed).
  const uids = [...new Set((members ?? []).map((m) => m.user_id))];
  const { data: profiles } = uids.length ? await supabase.from("user_profiles").select("id, display_name").in("id", uids) : { data: [] };
  const nameOf = new Map((profiles ?? []).map((x) => [x.id, x.display_name]));
  const all = docs ?? [];
  const n = (f: (d: (typeof all)[number]) => boolean) => all.filter(f).length;
  const adoptedIds = new Set((adopted ?? []).map((a) => a.version_id));
  const regDocs = (reg ?? []).filter((r) => r.kind === "document");
  const regBy = (s: string) => regDocs.filter((r) => r.status === s).length;

  return (
    <>
      <h1>Documents</h1>
      <p className="muted" style={{ maxWidth: 780 }}>Start here. Bring the documents you already have; the platform reads the rule documents, draws each process as it is written today,
        compares everything with a complete checklist for an Indian private limited company and shows what is missing, unclear or risky. Interviews then start from those findings.</p>
      {sp.e && <div className="notice error">{sp.e}</div>}
      {sp.ok && <div className="notice ok">{sp.ok}</div>}

      <div className="kpis" data-testid="doc-kpis">
        <div className="kpi"><div className="kpi-label">Files brought in</div><div className="kpi-value">{all.length}</div><div className="kpi-sub">duplicates counted once</div></div>
        <div className="kpi good"><div className="kpi-label">Rule documents</div><div className="kpi-value">{n((d) => d.category === "governing")}</div><div className="kpi-sub">{n((d) => d.analysis_status === "done")} analysed</div></div>
        <div className="kpi"><div className="kpi-label">Records</div><div className="kpi-value">{n((d) => d.category === "record")}</div><div className="kpi-sub">evidence that work happens</div></div>
        <div className="kpi attn"><div className="kpi-label">Personal / legal</div><div className="kpi-value">{n((d) => d.category === "sensitive")}</div><div className="kpi-sub">counted, never read</div></div>
        <div className="kpi"><div className="kpi-label">Could not be read</div><div className="kpi-value">{n((d) => d.read_status === "unreadable")}</div><div className="kpi-sub">old formats or scans</div></div>
      </div>

      <div className="card" data-testid="checklist">
        <h2 style={{ marginTop: 0 }}>Completeness checklist</h2>
        {(versions ?? []).length === 0 ? <p className="muted">No checklist is available yet.</p> : (versions ?? []).map((v) => adoptedIds.has(v.id) ? (
          <div key={v.id}><p><strong>{v.title}</strong> v{v.version} — {regDocs.length} expected documents:</p>
            <div className="row" style={{ gap: 8 }}>{Object.entries(STATUS).map(([k, label]) => regBy(k) ? <span key={k} className="badge">{label}: {regBy(k)}</span> : null)}</div></div>
        ) : (
          <form key={v.id} action={adoptBaseline.bind(null, companyId, v.id)}>
            <p><strong>{v.title}</strong> v{v.version}{v.as_of ? ` (as of ${v.as_of})` : ""}: 174 expected documents, 43 end-to-end processes and 44 legal applicability questions.
              Adopt it so nothing is missed — every item ends as found, partly covered, missing or not applicable with a reason.</p>
            <button type="submit">Use this checklist</button>
          </form>))}
      </div>

      <Uploader companyId={companyId} />

      <div className="card" data-testid="analysis">
        <h2 style={{ marginTop: 0 }}>Analysis</h2>
        <p className="small muted" style={{ maxWidth: 760 }}>Each rule document is read by an AI your administrator approved for company documents (personal and legal records are never sent): the process it describes (drawn as a flowchart), which checklist items it covers,
          what it is missing, loose ends, risks with suggested fixes, and questions for the people who run the work. Nothing is final until a person confirms it.</p>
        <Analyse companyId={companyId} queued={n((d) => d.category === "governing" && d.read_status === "read" && ["queued", "running", "waiting_provider"].includes(d.analysis_status))} />
        {n((d) => d.analysis_status === "waiting_provider") > 0 && <p className="notice small">{n((d) => d.analysis_status === "waiting_provider")} documents are waiting for an approved AI — approve one under Administration → AI connections → Data approvals.</p>}
        <div className="row" style={{ gap: 10, marginTop: 10 }}>
          <a className="button secondary" href={`/c/${companyId}/documents/findings`}>See findings</a>
          {adoptedIds.size > 0 && <form action={finalise.bind(null, companyId)}><button type="submit" className="secondary">Check against the checklist</button></form>}
        </div>
      </div>

      {(deptRows as DeptRow[] | null)?.length ? (
        <div className="card" id="stakeholders" data-testid="stakeholders">
          <h2 style={{ marginTop: 0 }}>Departments and who reviews them</h2>
          <p className="small muted" style={{ maxWidth: 760 }}>These departments appear in your documents. Name the people who know each area: they will see how the work is written today, the flowcharts,
            gaps, loose ends, risks and suggested fixes for their department, confirm or correct them, and then have their interview.</p>
          {(deptRows as DeptRow[]).some((d) => !d.department_id) && <form action={setupDepartments.bind(null, companyId)} style={{ marginBottom: 10 }}>
            <button type="submit">Create these departments</button></form>}
          <table className="small"><thead><tr><th>Department</th><th>Files</th><th>Open findings</th><th>Reviewers</th></tr></thead><tbody>
            {(deptRows as DeptRow[]).map((d) => (
              <tr key={d.code} className={d.stakeholders.length ? undefined : "needs"}><td><strong>{d.name}</strong>{!d.stakeholders.length && <div><span className="badge warn">Name a reviewer</span></div>}</td>
                <td>{d.files} ({d.rule_documents} rules)</td><td>{d.open_findings}</td>
                <td>{d.stakeholders.map((p) => (
                  <form key={p.membership_id} action={removeStakeholder.bind(null, companyId, d.code, p.membership_id)} className="row" style={{ gap: 4 }}>
                    <span>{p.name}{p.job_title ? ` · ${p.job_title}` : ""}</span><button type="submit" className="link small" aria-label={`Remove ${p.name}`}>remove</button></form>))}
                  <StakeholderForm companyId={companyId} dept={d.code} departmentId={d.department_id}
                    people={(members ?? []).map((m) => ({ id: m.id, name: nameOf.get(m.user_id) ?? "Unnamed" })).sort((a, b) => a.name.localeCompare(b.name))} /></td></tr>))}
          </tbody></table>
        </div>) : null}

      <div className="card" id="list" data-testid="doc-list">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h2 style={{ margin: 0 }}>Files</h2>
          <nav className="row small" style={{ gap: 10 }}>{Object.entries(CAT).map(([k, [label]]) => (
            <a key={k} href={`?cat=${k}#list`} aria-current={k === cat ? "page" : undefined} style={k === cat ? { fontWeight: 700 } : undefined}>{label} ({n((d) => d.category === k)})</a>))}</nav>
        </div>
        {(list ?? []).length === 0 ? <p className="muted">Nothing here yet.</p> : (
          <div style={{ overflowX: "auto" }}><table className="small"><thead><tr><th>File</th><th>Type</th><th>Department</th><th>Status</th><th>Change</th></tr></thead><tbody>
            {(list ?? []).map((d) => (
              <tr key={d.id}><td><strong>{d.file_name}</strong>{d.folder && <div className="muted">{d.folder}</div>}</td>
                <td>{d.doc_type.replace(/_/g, " ")}<div className="muted">{d.reason}</div></td>
                <td>{d.department_code ? DEPARTMENTS[d.department_code] ?? d.department_code : "—"}</td>
                <td>{d.read_status === "unreadable" ? <span className="badge warn">{d.unreadable_reason ?? "Could not be read"}</span> : d.category === "governing" ? AN[d.analysis_status] : "Counted"}</td>
                <td><form action={setCategory.bind(null, companyId, d.id)} className="row" style={{ gap: 4, flexWrap: "nowrap" }}>
                  <select name="category" defaultValue={d.category} aria-label="Category">{Object.entries(CAT).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}</select>
                  <select name="department" defaultValue={d.department_code ?? ""} aria-label="Department"><option value="">Department…</option>
                    {Object.entries(DEPARTMENTS).map(([k, v]) => <option key={k} value={k}>{v.split(" / ")[0]}</option>)}</select>
                  <button type="submit" className="secondary">Save</button></form></td></tr>))}
          </tbody></table></div>)}
        {(list ?? []).length === 500 && <p className="small muted">Showing the first 500.</p>}
      </div>
    </>
  );
}
