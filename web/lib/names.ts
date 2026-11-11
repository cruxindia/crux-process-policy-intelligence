import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

/** membership id -> display name, for the members the caller can see. */
export async function memberNames(supabase: SupabaseClient<Database>, companyId: string) {
  const { data: ms } = await supabase.from("memberships").select("id, user_id, primary_department_id, status")
    .eq("company_id", companyId).eq("member_kind", "human");
  const uids = (ms ?? []).map((m) => m.user_id);
  const { data: ps } = uids.length ? await supabase.from("user_profiles").select("id, display_name").in("id", uids) : { data: [] };
  const byUser = new Map((ps ?? []).map((p) => [p.id, p.display_name]));
  const names = new Map<string, string>();
  const members: { id: string; name: string; departmentId: string | null; status: string }[] = [];
  for (const m of ms ?? []) {
    const n = byUser.get(m.user_id) ?? "Member";
    names.set(m.id, n);
    members.push({ id: m.id, name: n, departmentId: m.primary_department_id, status: m.status });
  }
  members.sort((a, b) => a.name.localeCompare(b.name));
  return { names, members };
}

export const fmtDate = (s: string | null | undefined) => (s ? new Date(s).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" }) : "");
