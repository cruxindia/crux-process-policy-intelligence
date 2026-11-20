"use client";
import { useActionState } from "react";
import { createCompany, type CreateResult } from "../actions";

export function NewCompanyForm() {
  const [state, action, pending] = useActionState<CreateResult, FormData>(createCompany, null);
  return (
    <form action={action} className="card" data-testid="new-company">
      <p className="muted small" style={{ marginTop: 0 }}>The company gets the standard roles, interview set-up, expert board and process catalogue. Its first administrator then invites the people.</p>
      {state && !state.ok && <div className="notice error">{state.error}</div>}
      {state?.ok && (
        <div className="notice ok once" data-testid="created">
          Company created. {state.tempPassword
            ? <>Send the administrator ({state.email}) this temporary password — it is shown <strong>only once</strong>: <span className="mono" data-testid="temp-pw">{state.tempPassword}</span>. They must replace it at first sign-in.</>
            : <>{state.email} already has an account: they sign in as usual and accept the invitation.</>}
        </div>
      )}
      <div className="grid2">
        <div><label htmlFor="nc-name">Company name</label><input id="nc-name" name="name" required placeholder="e.g. Acme Services Pvt Ltd" /></div>
        <div><label htmlFor="nc-code">Short code</label><input id="nc-code" name="code" required placeholder="e.g. ACME" pattern="[A-Za-z0-9][A-Za-z0-9_-]{1,31}" /></div>
        <div><label htmlFor="nc-admin">Administrator&rsquo;s name</label><input id="nc-admin" name="admin" required /></div>
        <div><label htmlFor="nc-email">Administrator&rsquo;s email</label><input id="nc-email" name="email" type="email" required /></div>
        <div><label htmlFor="nc-job">Administrator&rsquo;s job title (optional)</label><input id="nc-job" name="job" /></div>
      </div>
      <button type="submit" disabled={pending} style={{ marginTop: 12 }}>{pending ? "Creating…" : "Create company"}</button>
    </form>
  );
}
