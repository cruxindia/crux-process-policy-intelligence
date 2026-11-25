import "server-only";
import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

// Each helper is memoised per request (React cache): the root layout, the company layout and the page share one lookup
// instead of repeating the same round trips to the database (P8 full-run finding: 4-6 s pages from repeated checks).

/** Signed-in user's id (validated JWT) and a client acting as them. */
export const requireUser = cache(async function requireUser() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId) redirect("/login");
  return { supabase, userId };
});

/** The caller's active membership in a company, plus the permission codes they hold there (for UI only). */
export const requireMembership = cache(async function requireMembership(companyId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(companyId)) notFound();
  const { supabase, userId } = await requireUser();
  // Three independent lookups in parallel (one round trip instead of three).
  const [{ data: membership }, { data: mustChange }, { data: perms }] = await Promise.all([
    supabase.from("memberships").select("id, status, job_title, primary_department_id, company_id, companies!memberships_company_id_fkey(name, code)")
      .eq("company_id", companyId).eq("user_id", userId).eq("status", "active").maybeSingle(),
    supabase.rpc("password_change_required"),
    supabase.rpc("my_permissions", { p_company: companyId }),
  ]);
  if (!membership) notFound();
  // A reset (temporary) password must be replaced before anything else.
  if (mustChange) redirect("/account/password");
  return { supabase, userId, membership, permissions: new Set<string>(perms ?? []) };
});

export type DbError = { message: string; code?: string } | null;

/** Human-readable text for errors raised by database guards (PPI_* messages) and RLS refusals. */
export function explain(error: DbError): string {
  if (!error) return "";
  const m = /PPI_[A-Z_]+:\s*(.*)$/.exec(error.message);
  if (error.code === "42501" && !m) return "You do not have permission to do that.";  // our own guards explain themselves
  return m?.[1] ?? error.message;
}

/** The platform owner ("super admin", D-091). Everyone else gets a 404 — the console's existence is not advertised. */
export const requirePlatformAdmin = cache(async function requirePlatformAdmin() {
  const { supabase, userId } = await requireUser();
  const { data: ok } = await supabase.rpc("am_platform_admin");
  if (!ok) notFound();
  return { supabase, userId };
});
