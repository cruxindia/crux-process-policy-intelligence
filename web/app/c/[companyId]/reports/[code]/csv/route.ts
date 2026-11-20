import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { COMPANY_MIS, csvName, toCsv, type MisResult } from "@/lib/mis";

/** CSV download of one MIS report. Same database checks as the page (the RPC enforces access and scope). */
export async function GET(req: NextRequest, { params }: { params: Promise<{ companyId: string; code: string }> }) {
  const { companyId, code } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(companyId) || !COMPANY_MIS.some((m) => m.code === code)) return new NextResponse("Not found", { status: 404 });
  const supabase = await createClient();
  const ok = (s: string | null) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : undefined);
  const { data, error } = await supabase.rpc("mis_report", { p_company: companyId, p_report: code, p_from: ok(req.nextUrl.searchParams.get("from")), p_to: ok(req.nextUrl.searchParams.get("to")) });
  if (error || !data) return new NextResponse(error?.code === "42501" ? "Not allowed" : "Could not build the report", { status: error?.code === "42501" ? 403 : 400 });
  const r = data as unknown as MisResult;
  return new NextResponse(toCsv(r), { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="${csvName(r.title, r.from, r.to)}"`, "cache-control": "no-store" } });
}
