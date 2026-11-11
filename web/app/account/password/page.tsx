import { requireUser } from "@/lib/session";
import { setPassword } from "./actions";

export default async function PasswordPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const { supabase } = await requireUser();
  const { data: required } = await supabase.rpc("password_change_required");
  return (
    <div style={{ maxWidth: 420, margin: "40px auto" }}>
      <h1>{required ? "Set your password" : "Change password"}</h1>
      {required && <p className="muted">You signed in with a temporary password. Choose your own before continuing; the temporary one stops working.</p>}
      {sp.e && <div className="notice error">{sp.e}</div>}
      <form action={setPassword} className="card">
        <label htmlFor="password">New password (at least 12 characters)</label>
        <input id="password" name="password" type="password" autoComplete="new-password" minLength={12} required />
        <label htmlFor="confirm">Repeat new password</label>
        <input id="confirm" name="confirm" type="password" autoComplete="new-password" minLength={12} required />
        <div style={{ marginTop: 12 }}><button type="submit">Save password</button></div>
      </form>
    </div>
  );
}
