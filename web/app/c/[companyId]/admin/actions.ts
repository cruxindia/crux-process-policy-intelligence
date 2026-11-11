"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireMembership, explain } from "@/lib/session";

const s = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const CODE = /^[A-Z0-9][A-Z0-9_-]{1,31}$/;
function back(companyId: string, q: string): never {
  redirect(`/c/${companyId}/admin?${q}`);
}
const ok = (c: string, m: string) => { revalidatePath(`/c/${c}/admin`); back(c, `ok=${encodeURIComponent(m)}`); };
const fail = (c: string, m: string) => back(c, `e=${encodeURIComponent(m)}`);

export async function addDepartment(companyId: string, f: FormData) {
  const { supabase } = await requireMembership(companyId);
  const code = s(f, "code").toUpperCase();
  if (!CODE.test(code)) fail(companyId, "Department code: 2–32 letters, digits, - or _.");
  const { error } = await supabase.from("departments").insert({
    company_id: companyId, code, name: s(f, "name"), mandate: s(f, "mandate") || null,
    parent_department_id: s(f, "parent_department_id") || null,
  });
  if (error) fail(companyId, error.code === "23505" ? "That department code already exists." : explain(error));
  ok(companyId, "Department added.");
}

export async function addProcess(companyId: string, f: FormData) {
  const { supabase } = await requireMembership(companyId);
  const code = s(f, "code").toUpperCase();
  if (!CODE.test(code)) fail(companyId, "Process code: 2–32 letters, digits, - or _.");
  const cls = s(f, "classification");
  if (!["internal", "confidential", "restricted", "public"].includes(cls)) fail(companyId, "Choose a classification.");
  const { error } = await supabase.from("processes").insert({
    company_id: companyId, code, name: s(f, "name"), purpose: s(f, "purpose") || null,
    owner_department_id: s(f, "owner_department_id"), classification: cls as "internal", status: "candidate",
  });
  if (error) fail(companyId, error.code === "23505" ? "That process code already exists." : explain(error));
  ok(companyId, "Process added to the catalogue (status: candidate).");
}

export async function grantRole(companyId: string, f: FormData) {
  const { supabase } = await requireMembership(companyId);
  const dept = s(f, "scope_department_id");
  const { error } = await supabase.from("role_assignments").insert({
    company_id: companyId, membership_id: s(f, "membership_id"), role_id: s(f, "role_id"),
    scope_type: dept ? "department" : "company", scope_department_id: dept || null,
  });
  if (error) fail(companyId, explain(error));
  ok(companyId, "Role granted.");
}

export async function revokeRole(companyId: string, assignmentId: string) {
  const { supabase } = await requireMembership(companyId);
  const { data, error } = await supabase.from("role_assignments").update({ status: "revoked" })
    .eq("company_id", companyId).eq("id", assignmentId).select("id");
  if (error) fail(companyId, explain(error));
  if (!data?.length) fail(companyId, "You do not have permission to revoke that role.");
  ok(companyId, "Role revoked.");
}

export type InviteState = { error?: string; password?: string; who?: string; existing?: boolean } | null;

export async function invite(companyId: string, _prev: InviteState, f: FormData): Promise<InviteState> {
  const { supabase } = await requireMembership(companyId);
  const name = s(f, "display_name");
  const role = s(f, "role_code");
  const scope = s(f, "scope_department_id");
  const { data, error } = await supabase.rpc("invite_member", {
    p_company: companyId, p_email: s(f, "email"), p_display_name: name, p_job_title: s(f, "job_title") || undefined,
    p_department: s(f, "department_id") || undefined, p_role_code: role || undefined, p_scope_department: scope || undefined,
  });
  if (error) return { error: explain(error) };
  revalidatePath(`/c/${companyId}/admin`);
  const r = data as { temporary_password: string | null; existing_account: boolean };
  return { who: name, password: r.temporary_password ?? undefined, existing: r.existing_account };
}

export async function reissue(companyId: string, membershipId: string, who: string, _prev: InviteState): Promise<InviteState> {
  const { supabase } = await requireMembership(companyId);
  const { data, error } = await supabase.rpc("reissue_temporary_password", { p_company: companyId, p_membership: membershipId });
  if (error) return { error: explain(error) };
  return { who, password: data ?? undefined };
}
