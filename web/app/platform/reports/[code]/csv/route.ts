import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { csvName, PLATFORM_MIS, toCsv, type MisResult } from "@/lib/mis";

/** CSV of a platform report; the database allows platform owners only. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  if (!PLATFORM_MIS.some((m) => m.code === code)) return new NextResponse("Not found", { status: 404 });
  const supabase = await createClient();
  const ok = (s: string | null) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : undefined);
  const { data, error } = await supabase.rpc("platform_mis", { p_report: code, p_from: ok(req.nextUrl.searchParams.get("from")), p_to: ok(req.nextUrl.searchParams.get("to")) });
  if (error || !data) return new NextResponse(error?.code === "42501" ? "Not allowed" : "Could not build the report", { status: error?.code === "42501" ? 403 : 400 });
  const r = data as unknown as MisResult;
  return new NextResponse(toCsv(r), { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="${csvName(r.title, r.from, r.to)}"`, "cache-control": "no-store" } });
}
