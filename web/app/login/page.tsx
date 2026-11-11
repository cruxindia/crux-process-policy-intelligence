import Link from "next/link";
import { sendSignInLink, signInWithPassword } from "./actions";

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const linkMode = sp.m === "link";
  return (
    <div style={{ maxWidth: 420, margin: "40px auto" }}>
      <h1>Sign in</h1>
      <p className="muted">Access is by invitation only.</p>
      {sp.sent && <div className="notice ok">If that address has an account and can receive our email, a sign-in link is on its way.</div>}
      {sp.e === "invalid" && <div className="notice error">Enter a valid email address{linkMode ? "" : " and password"}.</div>}
      {sp.e === "credentials" && <div className="notice error">Email or password is not correct.</div>}
      {sp.e === "link" && <div className="notice error">That sign-in link is invalid or has expired. Request a new one.</div>}

      {!linkMode ? (
        <form action={signInWithPassword} className="card">
          <label htmlFor="email">Work email</label>
          <input id="email" name="email" type="email" autoComplete="username" required />
          <label htmlFor="password">Password</label>
          <input id="password" name="password" type="password" autoComplete="current-password" required />
          <p className="muted small">First time? Use the temporary password your administrator gave you; you will set your own next.</p>
          <div className="row" style={{ marginTop: 12 }}>
            <button type="submit">Sign in</button>
            <Link href="/login?m=link" className="small">Email me a sign-in link instead</Link>
          </div>
        </form>
      ) : (
        <form action={sendSignInLink} className="card">
          <label htmlFor="email">Work email</label>
          <input id="email" name="email" type="email" autoComplete="email" required />
          <div className="row" style={{ marginTop: 12 }}>
            <button type="submit">Email me a sign-in link</button>
            <Link href="/login" className="small">Use a password instead</Link>
          </div>
        </form>
      )}
    </div>
  );
}
