"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { explain, requirePlatformAdmin } from "@/lib/session";

export type CreateResult = { ok: true; companyId: string; tempPassword: string | null; email: string } | { ok: false; error: string } | null;

/** New client company + its first administrator. A new account's temporary password is returned once (never stored in clear). */
export async function createCompany(_prev: CreateResult, form: FormData): Promise<CreateResult> {
  const { supabase } = await requirePlatformAdmin();
  const g = (k: string) => String(form.get(k) ?? "").trim();
  const { data, error } = await supabase.rpc("platform_create_company", { p_code: g("code").toUpperCase(), p_name: g("name"),
    p_admin_email: g("email"), p_admin_name: g("admin"), p_admin_job: g("job") || null });
  if (error) return { ok: false, error: explain(error) };
  revalidatePath("/platform");
  const r = data as { company_id: string; temporary_password: string | null };
  return { ok: true, companyId: r.company_id, tempPassword: r.temporary_password, email: g("email") };
}

/** New client company that the platform owner sets up himself (he becomes its administrator; logged). Opens the set-up guide. */
export async function createCompanySelf(_prev: CreateResult, form: FormData): Promise<CreateResult> {
  const { supabase } = await requirePlatformAdmin();
  const g = (k: string) => String(form.get(k) ?? "").trim();
  const { data, error } = await supabase.rpc("platform_create_company_self", { p_code: g("code").toUpperCase(), p_name: g("name") });
  if (error) return { ok: false, error: explain(error) };
  revalidatePath("/platform");
  redirect(`/c/${data as string}/setup`);
}

/** Open an existing company as its administrator (logged in the platform log and visible in the company's member list). */
export async function openCompany(companyId: string) {
  const { supabase } = await requirePlatformAdmin();
  const { error } = await supabase.rpc("platform_open_company", { p_company: companyId });
  if (error) redirect(`/platform/companies?e=${encodeURIComponent(explain(error))}`);
  redirect(`/c/${companyId}/setup`);
}

export async function setCompanyStatus(companyId: string, form: FormData) {
  const { supabase } = await requirePlatformAdmin();
  const { error } = await supabase.rpc("platform_set_company_status", { p_company: companyId, p_status: String(form.get("status")), p_note: String(form.get("note") ?? "") || null });
  revalidatePath("/platform");
  redirect(`/platform/companies?${error ? "e=" + encodeURIComponent(explain(error)) : "ok=Status+saved"}`);
}

export async function platformReply(companyId: string, ticketId: string, form: FormData) {
  const { supabase } = await requirePlatformAdmin();
  const { error } = await supabase.rpc("ticket_comment", { p_company: companyId, p_ticket: ticketId, p_body: String(form.get("body") ?? "") });
  revalidatePath(`/platform/tickets/${companyId}/${ticketId}`);
  redirect(`/platform/tickets/${companyId}/${ticketId}${error ? "?e=" + encodeURIComponent(explain(error)) : ""}`);
}

export async function platformStatus(companyId: string, ticketId: string, form: FormData) {
  const { supabase } = await requirePlatformAdmin();
  const { error } = await supabase.rpc("ticket_set_status", { p_company: companyId, p_ticket: ticketId, p_status: String(form.get("status")), p_resolution: String(form.get("resolution") ?? "") || null });
  revalidatePath("/platform/tickets");
  redirect(`/platform/tickets/${companyId}/${ticketId}?${error ? "e=" + encodeURIComponent(explain(error)) : "ok=Updated"}`);
}
