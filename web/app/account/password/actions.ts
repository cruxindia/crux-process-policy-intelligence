"use server";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";

export async function setPassword(formData: FormData) {
  const pw = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  if (pw.length < 12) redirect("/account/password?e=" + encodeURIComponent("Use at least 12 characters."));
  if (pw !== confirm) redirect("/account/password?e=" + encodeURIComponent("The two passwords do not match."));
  const { supabase } = await requireUser();
  const { error } = await supabase.auth.updateUser({ password: pw });
  if (error) redirect("/account/password?e=" + encodeURIComponent(error.message));
  redirect("/?pw=1");
}
