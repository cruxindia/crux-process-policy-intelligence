"use client";
import { useActionState } from "react";
import { invite, reissue, resetPassword, type InviteState } from "./actions";

function Secret({ state }: { state: InviteState }) {
  if (!state) return null;
  if (state.error) return <div className="notice error">{state.error}</div>;
  if (state.existing) return <div className="notice ok">{state.who} already has an account. They sign in as usual and accept the invitation.</div>;
  return (
    <div className="notice ok">
      <strong>Temporary password for {state.who}</strong> — shown once, give it to them privately (not by group chat):
      <div style={{ fontFamily: "ui-monospace, monospace", fontSize: "1.05rem", margin: "6px 0", userSelect: "all" }}>{state.password}</div>
      <span className="small">They sign in with their mobile number (or email) and this password, then must choose their own straight away.</span>
    </div>
  );
}

export function InviteForm(props: {
  companyId: string; departments: { id: string; label: string }[]; roles: { code: string; name: string }[]; canGrant: boolean;
}) {
  const [state, action, pending] = useActionState(invite.bind(null, props.companyId), null);
  return (
    <form action={action} className="card">
      <Secret state={state} />
      <div className="grid2">
        <div><label htmlFor="inv-email">Work email</label><input id="inv-email" name="email" type="email" required /></div>
        <div><label htmlFor="inv-name">Full name</label><input id="inv-name" name="display_name" required /></div>
        <div><label htmlFor="inv-title">Job title</label><input id="inv-title" name="job_title" /></div>
        <div><label htmlFor="inv-dept">Department</label>
          <select id="inv-dept" name="department_id" defaultValue="">
            <option value="">—</option>
            {props.departments.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
          </select></div>
        {props.canGrant && (<>
          <div><label htmlFor="inv-role">Role</label>
            <select id="inv-role" name="role_code" defaultValue="">
              <option value="">— none yet —</option>
              {props.roles.map((r) => <option key={r.code} value={r.code}>{r.name}</option>)}
            </select></div>
          <div><label htmlFor="inv-scope">Role applies to</label>
            <select id="inv-scope" name="scope_department_id" defaultValue="">
              <option value="">Whole company</option>
              {props.departments.map((d) => <option key={d.id} value={d.id}>{d.label} (and sub-departments)</option>)}
            </select></div>
        </>)}
      </div>
      <div style={{ marginTop: 12 }}><button type="submit" disabled={pending}>{pending ? "Inviting…" : "Invite"}</button></div>
    </form>
  );
}

export function ReissueButton(props: { companyId: string; membershipId: string; who: string }) {
  const [state, action, pending] = useActionState(reissue.bind(null, props.companyId, props.membershipId, props.who), null);
  return (
    <form action={action}>
      <button type="submit" className="secondary" disabled={pending}>New temporary password</button>
      <Secret state={state} />
    </form>
  );
}

export function ResetButton(props: { companyId: string; membershipId: string; who: string }) {
  const [state, action, pending] = useActionState(resetPassword.bind(null, props.companyId, props.membershipId, props.who), null);
  return (
    <form action={action}>
      <button type="submit" className="secondary" disabled={pending}>Reset password</button>
      <Secret state={state} />
    </form>
  );
}
