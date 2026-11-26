"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { explain, requireMembership } from "@/lib/session";
import { PROFILE_FIELDS } from "@/lib/company-profile";



const go = (companyId: string, q: string, hash = "") => redirect(`/c/${companyId}/setup?${q}${hash}`);

export async function saveProfile(companyId: string, form: FormData) {
  const { supabase } = await requireMembership(companyId);
  const p: Record<string, string> = {};
  for (const [k] of PROFILE_FIELDS) p[k] = String(form.get(k) ?? "");
  const { error } = await supabase.rpc("company_profile_set", { p_company: companyId, p_profile: p });
  revalidatePath(`/c/${companyId}/setup`);
  go(companyId, error ? `e=${encodeURIComponent(explain(error))}` : "ok=Company+details+saved.", "#details");
}

export async function adoptChecklist(companyId: string, versionId: string) {
  const { supabase } = await requireMembership(companyId);
  const { error } = await supabase.rpc("adopt_baseline", { p_company: companyId, p_version: versionId });
  revalidatePath(`/c/${companyId}/setup`);
  go(companyId, error ? `e=${encodeURIComponent(explain(error))}` : "ok=Checklist+added.", "#checklist");
}

export async function createDepartments(companyId: string) {
  const { supabase } = await requireMembership(companyId);
  const { error } = await supabase.rpc("doc_departments", { p_company: companyId, p_create: true });
  revalidatePath(`/c/${companyId}/setup`);
  go(companyId, error ? `e=${encodeURIComponent(explain(error))}` : "ok=Departments+created+from+the+documents.", "#reviewers");
}

export async function startInterviews(companyId: string) {
  const { supabase } = await requireMembership(companyId);
  const { data, error } = await supabase.rpc("doc_reviewers_interview", { p_company: companyId });
  revalidatePath(`/c/${companyId}/setup`);
  const r = data as { assigned: number; already: number } | null;
  go(companyId, error ? `e=${encodeURIComponent(explain(error))}`
    : `ok=${encodeURIComponent(`${r?.assigned ?? 0} reviewer interview${r?.assigned === 1 ? "" : "s"} started${r?.already ? ` (${r.already} already had one)` : ""}. Each reviewer sees it on their home page.`)}`, "#interviews");
}

export type ImportRow = { line: number; name: string; email: string; status: "invited" | "exists" | "error"; detail?: string; password?: string };
export type ImportState = { rows: ImportRow[] } | { error: string } | null;

/** People list pasted from Excel/CSV: name, e-mail, job title, department code. New people get a temporary password,
 *  returned in this response only (shown once, never stored in clear or put in a URL). At most 300 rows per run. */
export async function importPeople(companyId: string, _prev: ImportState, form: FormData): Promise<ImportState> {
  const { supabase } = await requireMembership(companyId);
  const lines = String(form.get("people") ?? "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return { error: "Paste at least one line: name, e-mail, job title, department code." };
  if (lines.length > 300) return { error: "Up to 300 people per run — paste the rest in a second run." };
  const { data: depts } = await supabase.from("departments").select("id, code, name").eq("company_id", companyId);
  const byCode = new Map((depts ?? []).flatMap((d) => [[d.code.toUpperCase(), d.id], [d.name.toUpperCase(), d.id]] as [string, string][]));
  const rows: ImportRow[] = [];
  for (const [i, raw] of lines.entries()) {
    const cells = raw.split(raw.includes("\t") ? "\t" : ",").map((c) => c.trim().replace(/^"|"$/g, ""));
    const [name = "", email = "", job = "", dept = ""] = cells;
    if (i === 0 && /e-?mail/i.test(email)) continue;                 // header row
    if (!name || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { rows.push({ line: i + 1, name, email, status: "error", detail: "Needs a name and a valid e-mail" }); continue; }
    const deptId = dept ? byCode.get(dept.toUpperCase()) : undefined;
    const { data, error } = await supabase.rpc("invite_member", { p_company: companyId, p_email: email, p_display_name: name,
      p_job_title: job || undefined, p_department: deptId });
    if (error) { rows.push({ line: i + 1, name, email, status: /already a member/i.test(error.message) ? "exists" : "error", detail: explain(error) }); continue; }
    const r = data as { temporary_password: string | null };
    rows.push({ line: i + 1, name, email, status: "invited", password: r.temporary_password ?? undefined,
      detail: dept && !deptId ? `Department “${dept}” not found — set it later` : undefined });
  }
  revalidatePath(`/c/${companyId}/setup`);
  return { rows };
}
