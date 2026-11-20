"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { explain, requireMembership } from "@/lib/session";

const s = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
export type KeyState = { key?: string; name?: string; error?: string } | null;

/** The plaintext key is returned to this one response only (shown once); the database keeps a hash. */
export async function createKey(companyId: string, _prev: KeyState, form: FormData): Promise<KeyState> {
  const { supabase } = await requireMembership(companyId);
  const name = s(form, "name");
  const { data, error } = await supabase.rpc("company_create_api_key", { p_company: companyId, p_name: name });
  revalidatePath(`/c/${companyId}/integrations`);
  if (error) return { error: explain(error) };
  return { key: String((data as { key: string }).key), name };
}

export async function revokeKey(companyId: string, keyId: string) {
  const { supabase } = await requireMembership(companyId);
  const { error } = await supabase.rpc("company_revoke_api_key", { p_company: companyId, p_key: keyId });
  revalidatePath(`/c/${companyId}/integrations`);
  redirect(`/c/${companyId}/integrations?${error ? "e=" + encodeURIComponent(explain(error)) : "ok=Key+revoked.+Apps+using+it+stop+working+now."}#keys`);
}

export async function release(companyId: string, caseId: string, form: FormData) {
  const { supabase } = await requireMembership(companyId);
  const { error } = await supabase.rpc("company_release_document", { p_company: companyId, p_case: caseId, p_slug: s(form, "slug"), p_public_embed: form.get("embed") === "on" });
  revalidatePath(`/c/${companyId}/integrations`);
  redirect(`/c/${companyId}/integrations?${error ? "e=" + encodeURIComponent(explain(error)) : "ok=Document+released"}#docs`);
}

export async function unrelease(companyId: string, releaseId: string) {
  const { supabase } = await requireMembership(companyId);
  const { error } = await supabase.rpc("company_revoke_release", { p_company: companyId, p_release: releaseId });
  revalidatePath(`/c/${companyId}/integrations`);
  redirect(`/c/${companyId}/integrations?${error ? "e=" + encodeURIComponent(explain(error)) : "ok=Document+withdrawn+from+websites+and+apps"}#docs`);
}
