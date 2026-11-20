"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { explain, requireMembership } from "@/lib/session";

const s = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

export async function saveProfile(companyId: string, form: FormData) {
  const { supabase } = await requireMembership(companyId);
  const { error } = await supabase.rpc("company_save_billing_profile", { p_company: companyId, p_legal_name: s(form, "legal_name"), p_gstin: s(form, "gstin").toUpperCase(),
    p_address: s(form, "address"), p_state_code: s(form, "state_code"), p_email: s(form, "email") });
  revalidatePath(`/c/${companyId}/billing`);
  redirect(`/c/${companyId}/billing?${error ? "e=" + encodeURIComponent(error.code === "23514" ? "Please check the GSTIN (15 characters), state code (2 digits) and email." : explain(error)) : "ok=Billing+details+saved"}#details`);
}

export async function disputeInvoice(companyId: string, invoiceId: string, form: FormData) {
  const { supabase } = await requireMembership(companyId);
  const { data, error } = await supabase.rpc("company_dispute_invoice", { p_company: companyId, p_invoice: invoiceId, p_reason: s(form, "reason") });
  if (error) redirect(`/c/${companyId}/billing/${invoiceId}?e=${encodeURIComponent(explain(error))}`);
  redirect(`/c/${companyId}/tasks/${data}?ok=${encodeURIComponent("Dispute sent to the platform team. The invoice is marked as disputed until it is settled.")}`);
}
