import Link from "next/link";
import { notFound } from "next/navigation";
import { requireMembership } from "@/lib/session";
import { addDepartment, addProcess, grantRole, revokeRole } from "./actions";
import { InviteForm, ReissueButton, ResetButton } from "./invite-forms";

export default async function AdminPage({ params, searchParams }: {
  params: Promise<{ companyId: string }>; searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { companyId } = await params;
  const sp = await searchParams;
  const { supabase, membership, permissions: p } = await requireMembership(companyId);
  const can = { org: p.has("org.manage"), members: p.has("membership.manage"), roles: p.has("role.manage"), proc: p.has("process.edit") };
  if (!can.org && !can.members && !can.roles && !can.proc) notFound();

  const [deps, procs, members, roles, assigns] = await Promise.all([
    supabase.from("departments").select("id, code, name, parent_department_id, status").eq("company_id", companyId).order("code"),
    supabase.from("processes").select("id, code, name, owner_department_id, classification, status").eq("company_id", companyId).order("code"),
    supabase.from("memberships").select("id, user_id, job_title, status, primary_department_id").eq("company_id", companyId).eq("member_kind", "human").order("created_at"),
    supabase.from("roles").select("id, code, name, is_candidate").eq("company_id", companyId).order("code"),
    can.roles ? supabase.from("role_assignments").select("id, membership_id, role_id, scope_type, scope_department_id, status").eq("company_id", companyId).eq("status", "active")
              : Promise.resolve({ data: [] as { id: string; membership_id: string; role_id: string; scope_type: string; scope_department_id: string | null; status: string }[] }),
  ]);
  const { data: contacts } = can.members ? await supabase.rpc("member_contacts", { p_company: companyId }) : { data: [] };
  const contactOf = new Map((contacts ?? []).map((c) => [c.membership_id, [c.mobile ? `+91 ${c.mobile}` : null, c.email].filter(Boolean).join(" · ")]));
  const uids = (members.data ?? []).map((m) => m.user_id);
  const { data: profiles } = uids.length ? await supabase.from("user_profiles").select("id, display_name").in("id", uids) : { data: [] };
  const nameOf = new Map((profiles ?? []).map((x) => [x.id, x.display_name]));
  const depLabel = new Map((deps.data ?? []).map((d) => [d.id, `${d.code} · ${d.name}`]));
  const roleName = new Map((roles.data ?? []).map((r) => [r.id, r.name]));
  const depOptions = (deps.data ?? []).filter((d) => d.status === "active").map((d) => ({ id: d.id, label: `${d.code} · ${d.name}` }));

  return (
    <>
      <p><Link href={`/c/${companyId}`}>← Back</Link></p>
      <h1>Administration</h1>
      <p className="muted">Every change is checked by the database against your roles and recorded in the audit log.</p>
      <p><Link className="button secondary" href={`/c/${companyId}/admin/ai`}>AI connections, queue &amp; usage</Link></p>
      {sp.e && <div className="notice error">{sp.e}</div>}
      {sp.ok && <div className="notice ok">{sp.ok}</div>}

      <h2>Departments</h2>
      {!deps.data?.length && <p className="muted">No departments yet. Add the real structure — nothing is pre-filled.</p>}
      {!!deps.data?.length && (
        <div className="table-wrap"><table><thead><tr><th>Code</th><th>Name</th><th>Parent</th></tr></thead><tbody>
          {deps.data.map((d) => <tr key={d.id}><td>{d.code}</td><td>{d.name}</td><td>{d.parent_department_id ? depLabel.get(d.parent_department_id) : "—"}</td></tr>)}
        </tbody></table></div>
      )}
      {can.org && (
        <form action={addDepartment.bind(null, companyId)} className="card grid2">
          <div><label htmlFor="d-code">Code</label><input id="d-code" name="code" required placeholder="OPS" /></div>
          <div><label htmlFor="d-name">Name</label><input id="d-name" name="name" required placeholder="Operations" /></div>
          <div><label htmlFor="d-parent">Parent department</label>
            <select id="d-parent" name="parent_department_id" defaultValue=""><option value="">— top level —</option>
              {depOptions.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}</select></div>
          <div><label htmlFor="d-mandate">Mandate (optional)</label><input id="d-mandate" name="mandate" /></div>
          <div><button type="submit">Add department</button></div>
        </form>
      )}

      <h2>Process catalogue</h2>
      {!procs.data?.length && <p className="muted">No processes yet.</p>}
      {!!procs.data?.length && (
        <div className="table-wrap"><table><thead><tr><th>Code</th><th>Name</th><th>Owner department</th><th>Classification</th><th>Status</th></tr></thead><tbody>
          {procs.data.map((x) => <tr key={x.id}><td>{x.code}</td><td>{x.name}</td><td>{depLabel.get(x.owner_department_id)}</td><td>{x.classification}</td><td>{x.status}</td></tr>)}
        </tbody></table></div>
      )}
      {can.proc && depOptions.length > 0 && (
        <form action={addProcess.bind(null, companyId)} className="card grid2">
          <div><label htmlFor="p-code">Code</label><input id="p-code" name="code" required placeholder="OPS-P01" /></div>
          <div><label htmlFor="p-name">Name</label><input id="p-name" name="name" required /></div>
          <div><label htmlFor="p-dept">Owner department</label>
            <select id="p-dept" name="owner_department_id" required>{depOptions.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}</select></div>
          <div><label htmlFor="p-cls">Classification</label>
            <select id="p-cls" name="classification" defaultValue="internal">
              <option value="internal">Internal</option><option value="confidential">Confidential</option>
              <option value="restricted">Restricted</option><option value="public">Public</option></select></div>
          <div style={{ gridColumn: "1 / -1" }}><label htmlFor="p-purpose">Purpose (optional)</label><input id="p-purpose" name="purpose" /></div>
          <div><button type="submit">Add process</button></div>
        </form>
      )}

      <h2>Members</h2>
      <div className="table-wrap"><table><thead><tr><th>Name</th><th>Contact</th><th>Job title</th><th>Status</th>{can.roles && <th>Roles</th>}<th></th></tr></thead><tbody>
        {(members.data ?? []).map((m) => (
          <tr key={m.id}>
            <td>{nameOf.get(m.user_id) ?? "—"}{m.id === membership.id ? " (you)" : ""}</td>
            <td className="small">{contactOf.get(m.id) ?? ""}</td>
            <td>{m.job_title ?? ""}</td>
            <td><span className={`badge ${m.status === "active" ? "ok" : "warn"}`}>{m.status}</span></td>
            {can.roles && <td style={{ whiteSpace: "normal" }}>
              {(assigns.data ?? []).filter((a) => a.membership_id === m.id).map((a) => (
                <form key={a.id} action={revokeRole.bind(null, companyId, a.id)} className="row small" style={{ gap: 6 }}>
                  {roleName.get(a.role_id)} · {a.scope_type === "company" ? "company" : depLabel.get(a.scope_department_id ?? "")}
                  {m.id !== membership.id && <button type="submit" className="secondary" style={{ padding: "0 6px" }}>revoke</button>}
                </form>
              ))}
            </td>}
            <td>{can.members && m.status === "invited" && <ReissueButton companyId={companyId} membershipId={m.id} who={nameOf.get(m.user_id) ?? "member"} />}
                {can.members && m.status === "active" && m.id !== membership.id && <ResetButton companyId={companyId} membershipId={m.id} who={nameOf.get(m.user_id) ?? "member"} />}</td>
          </tr>
        ))}
      </tbody></table></div>

      {can.members && (<>
        <h2>Invite someone</h2>
        <InviteForm companyId={companyId} departments={depOptions} canGrant={can.roles}
          roles={(roles.data ?? []).map((r) => ({ code: r.code, name: `${r.name}${r.is_candidate ? " (candidate)" : ""}` }))} />
      </>)}

      {can.roles && (<>
        <h2>Grant a role</h2>
        <p className="muted small">Roles are candidates until CRUX confirms its authority matrix. You cannot grant roles to yourself.</p>
        <form action={grantRole.bind(null, companyId)} className="card grid2">
          <div><label htmlFor="g-m">Member</label>
            <select id="g-m" name="membership_id" required>{(members.data ?? []).filter((m) => m.id !== membership.id && m.status !== "left")
              .map((m) => <option key={m.id} value={m.id}>{nameOf.get(m.user_id) ?? m.id}</option>)}</select></div>
          <div><label htmlFor="g-r">Role</label>
            <select id="g-r" name="role_id" required>{(roles.data ?? []).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select></div>
          <div><label htmlFor="g-s">Applies to</label>
            <select id="g-s" name="scope_department_id" defaultValue=""><option value="">Whole company</option>
              {depOptions.map((d) => <option key={d.id} value={d.id}>{d.label} (and sub-departments)</option>)}</select></div>
          <div style={{ alignSelf: "end" }}><button type="submit">Grant role</button></div>
        </form>
      </>)}
    </>
  );
}
