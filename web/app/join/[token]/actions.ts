"use server";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { explain } from "@/lib/session";

export type JoinState = { error?: string } | null;

export async function join(token: string, _prev: JoinState, f: FormData): Promise<JoinState> {
  const name = String(f.get("name") ?? "").trim();
  const mobile = String(f.get("mobile") ?? "").trim();
  const email = String(f.get("email") ?? "").trim();
  const password = String(f.get("password") ?? "");
  if (password !== String(f.get("confirm") ?? "")) return { error: "The two passwords do not match." };

  const supabase = await createClient();
  await supabase.auth.signOut(); // start clean if someone else was signed in on this device
  const { data, error } = await supabase.rpc("register_with_join_link", {
    p_token: token, p_mobile: mobile, p_full_name: name, p_password: password, p_email: email || undefined,
  });
  if (error) return { error: explain(error) };
  const login = (data as { login: string }).login;
  const { error: e2 } = await supabase.auth.signInWithPassword({ email: login, password });
  if (e2) return { error: "Your account was created. Please sign in with your mobile number and password." };
  redirect("/");
}
