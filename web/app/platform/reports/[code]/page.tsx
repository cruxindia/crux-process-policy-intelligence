import { notFound } from "next/navigation";
import { explain, requirePlatformAdmin } from "@/lib/session";
import { PLATFORM_MIS, type MisResult } from "@/lib/mis";
import { MisTable } from "@/components/mis-table";

export default async function PlatformReport({ params, searchParams }: { params: Promise<{ code: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { code } = await params; const sp = await searchParams;
  const meta = PLATFORM_MIS.find((m) => m.code === code); if (!meta) notFound();
  const { supabase } = await requirePlatformAdmin();
  const ok = (s?: string) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : undefined);
  const { data, error } = await supabase.rpc("platform_mis", { p_report: code, p_from: ok(sp.from), p_to: ok(sp.to) });
  if (error || !data) return <><h1>{meta.title}</h1><div className="notice error">{explain(error)}</div></>;
  const r = data as unknown as MisResult;
  return <MisTable r={r} why={meta.why} back="/platform/reports" csvHref={`/platform/reports/${code}/csv?from=${r.from}&to=${r.to}`} />;
}
