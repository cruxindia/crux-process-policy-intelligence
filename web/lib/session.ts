import "server-only";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/** Signed-in user's id (validated JWT) and a client acting as them. */
export async function requireUser() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId) redirect("/login");
  return { supabase, userId };
}

/** The caller's active membership in a company, plus the permission codes they hold there (for UI only). */
export async function requireMembership(companyId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(companyId)) notFound();
  const { supabase, userId } = await requireUser();
  const { data: membership } = await supabase
    .from("memberships")
    .select("id, status, job_title, primary_department_id, company_id, companies(name, code)")
    .eq("company_id", companyId)
    .eq("user_id", userId)
    .eq("status", "active")
    .maybeSingle();
  if (!membership) notFound();
  // A reset (temporary) password must be replaced before anything else.
  const { data: mustChange } = await supabase.rpc("password_change_required");
  if (mustChange) redirect("/account/password");
  const { data: perms } = await supabase.rpc("my_permissions", { p_company: companyId });
  return { supabase, userId, membership, permissions: new Set<string>(perms ?? []) };
}

export type DbError = { message: string; code?: string } | null;

/** Human-readable text for errors raised by database guards (PPI_* messages) and RLS refusals. */
export function explain(error: DbError): string {
  if (!error) return "";
  if (error.code === "42501") return "You do not have permission to do that.";
  const m = /PPI_[A-Z_]+:\s*(.*)$/.exec(error.message);
  return m?.[1] ?? error.message;
}
