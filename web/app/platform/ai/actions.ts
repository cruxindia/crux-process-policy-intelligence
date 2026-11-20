"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { explain, requirePlatformAdmin } from "@/lib/session";

const s = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

export async function updateKey(id: string, form: FormData) {
  const { supabase } = await requirePlatformAdmin();
  const pr = s(form, "priority");
  const { error } = await supabase.rpc("platform_ai_pool_update", { p_id: id, p_label: s(form, "label") || null, p_model: s(form, "model") || null,
    p_priority: pr ? Number(pr) : null, p_status: s(form, "status") || null });
  revalidatePath("/platform/ai");
  redirect(`/platform/ai?${error ? "e=" + encodeURIComponent(explain(error)) : "ok=Key+updated"}`);
}

/** Irreversible: deletes the key from Vault. The form requires an explicit tick (no browser dialog). */
export async function removeKey(id: string, form: FormData) {
  const { supabase } = await requirePlatformAdmin();
  if (form.get("confirm") !== "yes") redirect("/platform/ai?e=" + encodeURIComponent("Tick “Remove permanently” to confirm."));
  const { error } = await supabase.rpc("platform_ai_pool_remove", { p_id: id });
  revalidatePath("/platform/ai");
  redirect(`/platform/ai?${error ? "e=" + encodeURIComponent(explain(error)) : "ok=Key+removed+from+the+vault"}`);
}
