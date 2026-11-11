"use server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function signInWithPassword(formData: FormData) {
  const id = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const supabase = await createClient();
  // The user ID is a mobile number (mapped by the database to the internal login) or an email address.
  let email = id;
  if (!id.includes("@")) {
    const { data } = await supabase.rpc("mobile_login_id", { p_mobile: id });
    email = (data as string | null) ?? "";
  }
  if (!EMAIL.test(email) || !password) redirect("/login?e=invalid");
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  // One message for every failure, so the form cannot be used to discover accounts.
  if (error) redirect("/login?e=credentials");
  redirect("/");
}

export async function sendSignInLink(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!EMAIL.test(email)) redirect("/login?e=invalid&m=link");
  const h = await headers();
  const origin = h.get("origin") ?? `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`;
  const supabase = await createClient();
  // shouldCreateUser: false — people join only by invitation; no open sign-up.
  await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: false, emailRedirectTo: `${origin}/auth/confirm` } });
  redirect("/login?sent=1&m=link");
}
