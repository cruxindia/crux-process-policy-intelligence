import { notFound } from "next/navigation";
import { requireMembership } from "@/lib/session";
import { FindingsView, type DocProcessRow, type FindingRow } from "@/components/findings-view";
import { decide } from "../actions";

/** A stakeholder's department: the work as written today (with flowcharts), gaps, loose ends, risks, suggested fixes and questions. */
export default async function DeptReview({ params, searchParams }: { params: Promise<{ companyId: string; dept: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { companyId, dept } = await params; const sp = await searchParams;
  if (!/^[A-Z]{2,6}$/.test(dept)) notFound();
  const { supabase } = await requireMembership(companyId);
  const [{ data: areas }, { data: findings }, { data: procs }] = await Promise.all([
    supabase.rpc("my_doc_reviews", { p_company: companyId }),
    supabase.from("doc_findings").select("id, kind, severity, department_code, title, detail, mitigation, evidence, status, decision_note, document_id").eq("company_id", companyId).eq("department_code", dept).limit(2000),
    supabase.from("doc_processes").select("id, name, department_code, owner_role, purpose, trigger_text, flow, controls, approvals, records, sla, document_id").eq("company_id", companyId).eq("department_code", dept).limit(300),
  ]);
  const area = ((areas ?? []) as { code: string; name: string; open: number; decided: number }[]).find((a) => a.code === dept);
  if (!area) notFound();
  const ids = [...new Set([...(findings ?? []).map((f) => f.document_id), ...(procs ?? []).map((p) => p.document_id)].filter(Boolean))] as string[];
  const { data: docs } = ids.length ? await supabase.from("source_documents").select("id, file_name").eq("company_id", companyId).in("id", ids) : { data: [] };
  const total = area.open + area.decided;
  return (
    <>
      <h1>{area.name}: what your documents say</h1>
      <p className="muted" style={{ maxWidth: 780 }}>Below is how your department&apos;s work is written in the company&apos;s documents today, and what an expert review found: gaps, loose ends, risks with suggested fixes,
        missing documents and questions. Mark each point as correct, not correct (say why) or already fixed, and answer the questions. Your answers shape the new documents.</p>
      {sp.e && <div className="notice error">{sp.e}</div>}
      {sp.ok && <div className="notice ok">{sp.ok}</div>}
      <div className="progress" aria-label="review progress" style={{ maxWidth: 420 }}><span style={{ width: `${total ? Math.round((area.decided / total) * 100) : 0}%` }} /></div>
      <p className="small" data-testid="review-progress">{area.decided} of {total} points answered</p>
      <FindingsView findings={(findings ?? []) as FindingRow[]} processes={(procs ?? []) as DocProcessRow[]} docNames={new Map((docs ?? []).map((d) => [d.id, d.file_name]))}
        decide={(id) => decide.bind(null, companyId, dept, id)} />
    </>
  );
}
