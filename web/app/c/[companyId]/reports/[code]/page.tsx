import { notFound } from "next/navigation";
import { explain, requireMembership } from "@/lib/session";
import { COMPANY_MIS, type MisResult } from "@/lib/mis";
import { MisTable } from "@/components/mis-table";

export default async function Report({ params, searchParams }: { params: Promise<{ companyId: string; code: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { companyId, code } = await params; const sp = await searchParams;
  const meta = COMPANY_MIS.find((m) => m.code === code); if (!meta) notFound();
  const { supabase, permissions } = await requireMembership(companyId);
  if (!permissions.has("report.read")) notFound();
  const ok = (s?: string) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : undefined);
  const { data, error } = await supabase.rpc("mis_report", { p_company: companyId, p_report: code, p_from: ok(sp.from), p_to: ok(sp.to) });
  if (error || !data) return <><h1>{meta.title}</h1><div className="notice error">{explain(error)}</div></>;
  const r = data as unknown as MisResult;
  return <MisTable r={r} why={meta.why} back={`/c/${companyId}/reports`} csvHref={`/c/${companyId}/reports/${code}/csv?from=${r.from}&to=${r.to}`} />;
}
