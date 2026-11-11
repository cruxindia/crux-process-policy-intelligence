import { sendSignInLink } from "./actions";

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  return (
    <div style={{ maxWidth: 420, margin: "40px auto" }}>
      <h1>Sign in</h1>
      <p className="muted">Access is by invitation. Enter the email address your administrator invited.</p>
      {sp.sent && <div className="notice ok">If that address has an account, a sign-in link is on its way. It expires after a short time.</div>}
      {sp.e === "invalid" && <div className="notice error">Enter a valid email address.</div>}
      {sp.e === "link" && <div className="notice error">That sign-in link is invalid or has expired. Request a new one.</div>}
      <form action={sendSignInLink} className="card">
        <label htmlFor="email">Work email</label>
        <input id="email" name="email" type="email" autoComplete="email" required />
        <div style={{ marginTop: 12 }}><button type="submit">Email me a sign-in link</button></div>
      </form>
    </div>
  );
}
