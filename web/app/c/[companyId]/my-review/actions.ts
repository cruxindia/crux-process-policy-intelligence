"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { explain, requireMembership } from "@/lib/session";

export async function decide(companyId: string, dept: string, findingId: string, form: FormData) {
  const { supabase } = await requireMembership(companyId);
  const { error } = await supabase.rpc("doc_finding_decide", { p_company: companyId, p_finding: findingId, p_status: String(form.get("status")), p_note: String(form.get("note") ?? "") || undefined });
  revalidatePath(`/c/${companyId}/my-review/${dept}`);
  redirect(`/c/${companyId}/my-review/${dept}?${error ? "e=" + encodeURIComponent(explain(error)) : "ok=Thank+you+%E2%80%94+saved"}`);
}
