"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireMembership, explain } from "@/lib/session";

const s = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const back = (companyId: string, q: string) => redirect(`/c/${companyId}/discovery?${q}`);

export async function loadTemplates(companyId: string) {
  const { supabase } = await requireMembership(companyId);
  const { data, error } = await supabase.rpc("load_starter_templates", { p_company: companyId });
  if (error) back(companyId, `e=${encodeURIComponent(explain(error))}`);
  revalidatePath(`/c/${companyId}/discovery`);
  back(companyId, `ok=${encodeURIComponent(`${data ?? 0} question(s) added.`)}`);
}

export async function createCampaign(companyId: string, f: FormData) {
  const { supabase, membership } = await requireMembership(companyId);
  const code = s(f, "code").toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9_-]{1,31}$/.test(code)) back(companyId, `e=${encodeURIComponent("Code: 2–32 letters, digits, - or _.")}`);
  const { error } = await supabase.from("interview_campaigns").insert({
    company_id: companyId, code, name: s(f, "name"), purpose: s(f, "purpose") || null,
    department_id: s(f, "department_id") || null, process_id: s(f, "process_id") || null,
    due_on: s(f, "due_on") || null, owner_membership_id: membership.id, status: "active",
  });
  if (error) back(companyId, `e=${encodeURIComponent(error.code === "23505" ? "That campaign code is already used." : explain(error))}`);
  revalidatePath(`/c/${companyId}/discovery`);
  back(companyId, `ok=${encodeURIComponent("Campaign created.")}`);
}

export async function createAssignment(companyId: string, f: FormData) {
  const { supabase } = await requireMembership(companyId);
  const { error } = await supabase.from("interview_assignments").insert({
    company_id: companyId, campaign_id: s(f, "campaign_id"), respondent_membership_id: s(f, "respondent_membership_id"),
    department_id: s(f, "department_id"), process_id: s(f, "process_id") || null, due_on: s(f, "due_on") || null,
  });
  if (error) back(companyId, `e=${encodeURIComponent(error.code === "23505" ? "That person already has this interview." : explain(error))}`);
  revalidatePath(`/c/${companyId}/discovery`);
  back(companyId, `ok=${encodeURIComponent("Interview assigned.")}`);
}
