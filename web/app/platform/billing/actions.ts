"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { explain, requirePlatformAdmin } from "@/lib/session";

const s = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const n = (f: FormData, k: string) => Number(s(f, k) || 0);
const back = (path: string, error: { message: string; code?: string } | null, ok: string) =>
  redirect(`${path}${path.includes("?") ? "&" : "?"}${error ? "e=" + encodeURIComponent(explain(error)) : "ok=" + encodeURIComponent(ok)}`);

/** Only our own pages are allowed as the place to return to. */
const home = (f: FormData) => (s(f, "back") === "/platform/billing?test=1" ? "/platform/billing?test=1" : "/platform/billing");

export async function savePlan(form: FormData) {
  const { supabase } = await requirePlatformAdmin();
  const { error } = await supabase.rpc("platform_save_plan", { p_id: s(form, "id") || null, p_code: s(form, "code"), p_name: s(form, "name"),
    p_description: s(form, "description") || null, p_monthly_fee: n(form, "monthly_fee"), p_included_people: n(form, "included_people"),
    p_price_per_extra_person: n(form, "price_per_extra_person"), p_included_ai_runs: n(form, "included_ai_runs"), p_price_per_100_ai_runs: n(form, "price_per_100_ai_runs"),
    p_features: s(form, "features").split("\n").map((x) => x.trim()).filter(Boolean), p_company: s(form, "company") || null, p_status: s(form, "status") || "active" });
  revalidatePath("/platform/billing");
  back("/platform/billing/plans", error, "Package saved");
}

export async function subscribe(form: FormData) {
  const { supabase } = await requirePlatformAdmin();
  const { error } = await supabase.rpc("platform_subscribe", { p_company: s(form, "company"), p_plan: s(form, "plan"), p_discount: n(form, "discount"),
    p_starts: s(form, "starts") || new Date().toISOString().slice(0, 10), p_note: s(form, "note") || null });
  revalidatePath("/platform/billing");
  back(home(form), error, "Package assigned");
}

export async function saveSettings(form: FormData) {
  const { supabase } = await requirePlatformAdmin();
  const keys = ["billing_legal_name", "billing_gstin", "billing_address", "billing_state_code", "invoice_prefix", "gst_rate", "sac_code", "payment_terms_days"];
  const p: Record<string, string> = Object.fromEntries(keys.map((k) => [k, k === "billing_gstin" ? s(form, k).toUpperCase() : s(form, k)]));
  p.auto_issue = form.get("auto_issue") ? "true" : "false";
  const { error } = await supabase.rpc("platform_save_billing_settings", { p });
  back("/platform/billing/settings", error, "Billing profile saved");
}

export async function generate(form: FormData) {
  const { supabase } = await requirePlatformAdmin();
  const { data, error } = await supabase.rpc("platform_generate_invoices", { p_month: `${s(form, "month")}-01` });
  revalidatePath("/platform/billing");
  const r = data as { invoices: number; issued: number } | null;
  back(home(form), error, `${r?.invoices ?? 0} invoice(s) prepared${r?.issued ? `, ${r.issued} issued` : " as drafts — review and issue them"}`);
}

export async function invoiceAction(id: string, form: FormData) {
  const { supabase } = await requirePlatformAdmin();
  const action = s(form, "action");
  const { data, error } = await supabase.rpc("platform_invoice_action", { p_invoice: id, p_action: action, p_note: s(form, "note") || null });
  revalidatePath("/platform/billing");
  if (!error && data === "deleted") back("/platform/billing", null, "Draft removed");
  back(`/platform/billing/invoices/${id}`, error, action === "issue" ? `Issued as ${data}` : `Done (${data})`);
}
