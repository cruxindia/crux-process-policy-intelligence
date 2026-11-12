"use server";
// Reviewer step (PPI-028): an AI-discovered process enters the governed catalogue only through this human action.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireMembership, explain } from "@/lib/session";

export async function promoteProcess(companyId: string, sessionId: string, discoveredId: string, f: FormData) {
  const { supabase } = await requireMembership(companyId);
  const existing = String(f.get("existing_process_id") ?? "").trim();
  const { error } = await supabase.rpc("promote_discovered_process", {
    p_company: companyId, p_discovered: discoveredId,
    p_code: existing ? null : String(f.get("code") ?? "").trim(),
    p_owner_department: existing ? null : String(f.get("owner_department_id") ?? "").trim() || null,
    p_classification: String(f.get("classification") ?? "internal"),
    ...(existing ? { p_existing_process: existing } : {}),
  });
  const back = `/c/${companyId}/work/${sessionId}`;
  if (error) redirect(`${back}?e=${encodeURIComponent(explain(error))}#p-${discoveredId}`);
  revalidatePath(back);
  redirect(`${back}?ok=${encodeURIComponent(existing ? "Linked to the catalogue process." : "Added to the process catalogue as a candidate.")}`);
}
