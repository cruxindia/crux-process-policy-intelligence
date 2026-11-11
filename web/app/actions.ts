"use server";
import { redirect } from "next/navigation";
import { requireUser, explain } from "@/lib/session";

export async function acceptInvitation(formData: FormData) {
  const companyId = String(formData.get("company_id") ?? "");
  const { supabase } = await requireUser();
  const { error } = await supabase.rpc("accept_membership", { p_company: companyId });
  if (error) redirect(`/?e=${encodeURIComponent(explain(error))}`);
  redirect(`/c/${companyId}`);
}
