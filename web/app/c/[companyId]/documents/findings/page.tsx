import { notFound } from "next/navigation";
import { requireMembership } from "@/lib/session";
import { DEPARTMENTS } from "@/lib/doc-classify";
import { FindingsView, type DocProcessRow, type FindingRow } from "@/components/findings-view";
import { decideFinding } from "../actions";

/** Findings from the documents, by department (administrators). */
export default async function Findings({ params, searchParams }: { params: Promise<{ companyId: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { companyId } = await params; const sp = await searchParams;
  const { supabase, permissions } = await requireMembership(companyId);
  if (!permissions.has("org.manage")) notFound();
  const dept = sp.dept && DEPARTMENTS[sp.dept] ? sp.dept : "";
  let fq = supabase.from("doc_findings").select("id, kind, severity, department_code, title, detail, mitigation, evidence, status, decision_note, document_id").eq("company_id", companyId).limit(3000);
  let pq = supabase.from("doc_processes").select("id, name, department_code, owner_role, purpose, trigger_text, flow, controls, approvals, records, sla, document_id").eq("company_id", companyId).limit(500);
  if (dept) { fq = fq.eq("department_code", dept); pq = pq.eq("department_code", dept); }
  const [{ data: findings }, { data: procs }, { data: docs }, { data: counts }] = await Promise.all([fq, pq,
    supabase.from("source_documents").select("id, file_name").eq("company_id", companyId).eq("category", "governing").limit(20000),
    supabase.from("doc_findings").select("department_code, status").eq("company_id", companyId).limit(20000)]);
  const docNames = new Map((docs ?? []).map((d) => [d.id, d.file_name]));
  const byDept = Object.keys(DEPARTMENTS).map((k) => ({ k, n: (counts ?? []).filter((c) => c.department_code === k && c.status === "open").length })).filter((d) => d.n > 0);
  return (
    <>
      <p className="small"><a href={`/c/${companyId}/documents`}>← Documents</a></p>
      <h1>Findings from your documents</h1>
      {sp.e && <div className="notice error">{sp.e}</div>}
      {sp.ok && <div className="notice ok">{sp.ok}</div>}
      <nav className="row small" style={{ gap: 10, margin: "8px 0 16px" }} data-testid="dept-filter">
        <a href="?" aria-current={!dept ? "page" : undefined} style={!dept ? { fontWeight: 700 } : undefined}>All departments</a>
        {byDept.map((d) => <a key={d.k} href={`?dept=${d.k}`} aria-current={dept === d.k ? "page" : undefined} style={dept === d.k ? { fontWeight: 700 } : undefined}>
          {DEPARTMENTS[d.k]!.split(" / ")[0]} ({d.n} open)</a>)}
      </nav>
      <FindingsView findings={(findings ?? []) as FindingRow[]} processes={(procs ?? []) as DocProcessRow[]} docNames={docNames}
        decide={(id) => decideFinding.bind(null, companyId, id)} hidden={{ dept }} />
    </>
  );
}
