"use client";
import { useActionState } from "react";
import { addStakeholder, type StakeState } from "./actions";

export function StakeholderForm({ companyId, dept, departmentId, people }: { companyId: string; dept: string; departmentId: string | null; people: { id: string; name: string }[] }) {
  const [st, act, busy] = useActionState<StakeState, FormData>(addStakeholder.bind(null, companyId, dept, departmentId), null);
  return (
    <form action={act} className="stake-form small" data-testid={`stake-form-${dept}`}>
      <select name="membership_id" defaultValue="" aria-label="Existing person"><option value="">Someone already in the platform…</option>
        {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
      <span className="muted">or invite</span>
      <input name="name" placeholder="Full name" maxLength={120} aria-label="Full name" />
      <input name="email" type="email" placeholder="E-mail" maxLength={200} aria-label="E-mail" />
      <input name="job_title" placeholder="Role (e.g. Finance Head)" maxLength={120} aria-label="Role" />
      <button type="submit" className="secondary" disabled={busy}>{busy ? "Adding…" : "Add"}</button>
      {st?.error && <span className="notice error" style={{ margin: 0 }}>{st.error}</span>}
      {st?.ok && <span className="notice ok" style={{ margin: 0 }}>{st.ok}{st.password && <> Temporary password for {st.who}: <strong className="mono" data-testid="temp-pw">{st.password}</strong> — share it privately; it must be changed at first sign-in.</>}</span>}
    </form>
  );
}
