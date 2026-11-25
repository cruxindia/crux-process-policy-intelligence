"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { explain, requireMembership } from "@/lib/session";

export async function adoptBaseline(companyId: string, versionId: string) {
  const { supabase } = await requireMembership(companyId);
  const { data, error } = await supabase.rpc("adopt_baseline", { p_company: companyId, p_version: versionId });
  revalidatePath(`/c/${companyId}/documents`);
  const d = data as { documents: number; processes: number; applicability: number } | null;
  redirect(`/c/${companyId}/documents?${error ? "e=" + encodeURIComponent(explain(error)) : `ok=${encodeURIComponent(`Checklist added: ${d?.documents ?? 0} documents, ${d?.processes ?? 0} processes and ${d?.applicability ?? 0} applicability questions to work through.`)}`}`);
}

export async function setCategory(companyId: string, documentId: string, form: FormData) {
  const { supabase } = await requireMembership(companyId);
  const { data, error } = await supabase.rpc("intake_set_category", { p_company: companyId, p_document: documentId, p_category: String(form.get("category")),
    p_doc_type: null, p_department: String(form.get("department") ?? "") || null });
  revalidatePath(`/c/${companyId}/documents`);
  redirect(`/c/${companyId}/documents?${error ? "e=" + encodeURIComponent(explain(error)) : "ok=" + encodeURIComponent(String(data))}#list`);
}

export async function finalise(companyId: string) {
  const { supabase } = await requireMembership(companyId);
  const { data, error } = await supabase.rpc("doc_assessment_finalize", { p_company: companyId });
  revalidatePath(`/c/${companyId}/documents`);
  const d = data as { covered: number; partly_covered: number; missing: number; duplicate_groups: number } | null;
  redirect(`/c/${companyId}/documents?${error ? "e=" + encodeURIComponent(explain(error)) : "ok=" + encodeURIComponent(`Checked against the checklist: ${d?.missing ?? 0} documents missing, ${d?.partly_covered ?? 0} partly covered, ${d?.duplicate_groups ?? 0} sets of duplicate versions.`)}`);
}

export async function decideFinding(companyId: string, findingId: string, form: FormData) {
  const { supabase } = await requireMembership(companyId);
  const { error } = await supabase.rpc("doc_finding_decide", { p_company: companyId, p_finding: findingId, p_status: String(form.get("status")), p_note: String(form.get("note") ?? "") || undefined });
  revalidatePath(`/c/${companyId}/documents/findings`);
  redirect(`/c/${companyId}/documents/findings?${error ? "e=" + encodeURIComponent(explain(error)) : "ok=Saved"}&${new URLSearchParams({ dept: String(form.get("dept") ?? ""), kind: String(form.get("kind") ?? "") })}`);
}

export async function setupDepartments(companyId: string) {
  const { supabase } = await requireMembership(companyId);
  const { error } = await supabase.rpc("doc_departments", { p_company: companyId, p_create: true });
  revalidatePath(`/c/${companyId}/documents`);
  redirect(`/c/${companyId}/documents?${error ? "e=" + encodeURIComponent(explain(error)) : "ok=Departments+set+up.+Now+name+the+people+who+should+review+each+one."}#stakeholders`);
}

export type StakeState = { ok?: string; error?: string; password?: string; who?: string } | null;

/** Adds an existing person, or invites a new one. A temporary password is returned in this response only (never in a URL). */
export async function addStakeholder(companyId: string, dept: string, departmentId: string | null, _prev: StakeState, form: FormData): Promise<StakeState> {
  const { supabase } = await requireMembership(companyId);
  let mid = String(form.get("membership_id") ?? "");
  let res: StakeState = {};
  if (!mid) {
    const name = String(form.get("name") ?? "").trim(); const email = String(form.get("email") ?? "").trim();
    if (!name || !email) return { error: "Choose a person, or give a name and e-mail to invite someone new." };
    const { data, error } = await supabase.rpc("invite_member", { p_company: companyId, p_email: email, p_display_name: name,
      p_job_title: String(form.get("job_title") ?? "").trim() || undefined, p_department: departmentId ?? undefined });
    if (error) return { error: explain(error) };
    const r = data as { membership_id: string; temporary_password: string | null };
    mid = r.membership_id; res = { who: name, password: r.temporary_password ?? undefined };
  }
  const { error } = await supabase.rpc("doc_stakeholder_add", { p_company: companyId, p_dept: dept, p_membership: mid });
  if (error) return { error: explain(error) };
  revalidatePath(`/c/${companyId}/documents`);
  return { ...res, ok: "Stakeholder added." };
}

export async function removeStakeholder(companyId: string, dept: string, membershipId: string) {
  const { supabase } = await requireMembership(companyId);
  const { error } = await supabase.rpc("doc_stakeholder_remove", { p_company: companyId, p_dept: dept, p_membership: membershipId });
  revalidatePath(`/c/${companyId}/documents`);
  redirect(`/c/${companyId}/documents?${error ? "e=" + encodeURIComponent(explain(error)) : "ok=Removed"}#stakeholders`);
}
