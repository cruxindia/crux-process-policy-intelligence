"use client";
import { useActionState } from "react";
import { join } from "./actions";

export function JoinForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState(join.bind(null, token), null);
  return (
    <form action={action} className="card">
      {state?.error && <div className="notice error">{state.error}</div>}
      <label htmlFor="name">Full name</label>
      <input id="name" name="name" autoComplete="name" required minLength={2} />
      <label htmlFor="mobile">Mobile number (this is your user ID)</label>
      <input id="mobile" name="mobile" type="tel" inputMode="numeric" autoComplete="tel" placeholder="10-digit mobile" required />
      <label htmlFor="email">Email (optional)</label>
      <input id="email" name="email" type="email" autoComplete="email" />
      <label htmlFor="password">Choose a password (at least 8 characters)</label>
      <input id="password" name="password" type="password" autoComplete="new-password" minLength={8} required />
      <label htmlFor="confirm">Repeat password</label>
      <input id="confirm" name="confirm" type="password" autoComplete="new-password" minLength={8} required />
      <div style={{ marginTop: 14 }}><button type="submit" disabled={pending} style={{ width: "100%" }}>{pending ? "Creating your account…" : "Sign up and start"}</button></div>
      <p className="muted small" style={{ marginTop: 10 }}>Already signed up? <a href="/login">Sign in</a></p>
    </form>
  );
}
