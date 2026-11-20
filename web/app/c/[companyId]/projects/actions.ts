"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { explain, requireMembership } from "@/lib/session";

const s = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const d = (f: FormData, k: string) => (/^\d{4}-\d{2}-\d{2}$/.test(s(f, k)) ? s(f, k) : null);

export async function saveProject(companyId: string, projectId: string | null, form: FormData) {
  const { supabase } = await requireMembership(companyId);
  const { data, error } = await supabase.rpc("project_save", { p_company: companyId, p_id: projectId, p_code: s(form, "code"), p_name: s(form, "name"),
    p_objective: s(form, "objective"), p_manager: s(form, "manager") || null, p_sponsor: s(form, "sponsor") || null,
    p_departments: form.getAll("departments").map(String).filter(Boolean), p_starts: d(form, "starts"), p_target_end: d(form, "target_end"), p_status: s(form, "status") || "active" });
  revalidatePath(`/c/${companyId}/projects`);
  if (error) redirect(`/c/${companyId}/projects${projectId ? `/${projectId}` : ""}?e=${encodeURIComponent(error.code === "23514" ? "Code: capitals, digits and hyphens (2-20); name 3-120 characters; end after start." : explain(error))}`);
  redirect(`/c/${companyId}/projects/${data}?ok=${projectId ? "Project+saved" : "Project+created"}`);
}

export async function saveMilestone(companyId: string, projectId: string, milestoneId: string | null, form: FormData) {
  const { supabase } = await requireMembership(companyId);
  const done = form.get("done");
  const { error } = await supabase.rpc("project_milestone_save", { p_company: companyId, p_project: projectId, p_id: milestoneId, p_title: s(form, "title"),
    p_due: d(form, "due"), p_owner: s(form, "owner") || null, p_done: done === null ? (milestoneId ? null : false) : done === "true" });
  revalidatePath(`/c/${companyId}/projects/${projectId}`);
  redirect(`/c/${companyId}/projects/${projectId}?${error ? "e=" + encodeURIComponent(explain(error)) : "ok=Milestone+saved"}#milestones`);
}
