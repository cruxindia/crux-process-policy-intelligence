import Link from "next/link";
import { notFound } from "next/navigation";
import { requireMembership } from "@/lib/session";
import { createAssignment, createCampaign, loadTemplates } from "./actions";

export default async function DiscoveryPage({ params, searchParams }: {
  params: Promise<{ companyId: string }>; searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { companyId } = await params;
  const sp = await searchParams;
  const { supabase, permissions } = await requireMembership(companyId);
  if (!permissions.has("interview.manage")) notFound();

  const [deps, procs, members, campaigns, assignments, templates] = await Promise.all([
    supabase.from("departments").select("id, code, name").eq("company_id", companyId).eq("status", "active").order("code"),
    supabase.from("processes").select("id, code, name, owner_department_id").eq("company_id", companyId).order("code"),
    supabase.from("memberships").select("id, user_id, job_title").eq("company_id", companyId).eq("status", "active").eq("member_kind", "human"),
    supabase.from("interview_campaigns").select("id, code, name, status, due_on, department_id, process_id").eq("company_id", companyId).order("created_at", { ascending: false }),
    supabase.from("interview_assignments").select("id, campaign_id, status, respondent_membership_id").eq("company_id", companyId),
    supabase.from("question_templates").select("scope_type", { count: "exact", head: false }).eq("company_id", companyId).eq("status", "active"),
  ]);
  const userIds = (members.data ?? []).map((m) => m.user_id);
  const { data: profiles } = userIds.length
    ? await supabase.from("user_profiles").select("id, display_name").in("id", userIds)
    : { data: [] as { id: string; display_name: string }[] };
  const nameOf = new Map((profiles ?? []).map((p) => [p.id, p.display_name]));
  const memberLabel = new Map((members.data ?? []).map((m) => [m.id, `${nameOf.get(m.user_id) ?? "Member"}${m.job_title ? ` · ${m.job_title}` : ""}`]));
  const depName = new Map((deps.data ?? []).map((d) => [d.id, `${d.code} · ${d.name}`]));
  const tCount = { department: 0, process: 0 };
  for (const t of templates.data ?? []) if (t.scope_type === "department" || t.scope_type === "process") tCount[t.scope_type]++;

  return (
    <>
      <p><Link href={`/c/${companyId}`}>← Back</Link></p>
      <h1>Discovery setup</h1>
      <p className="muted">Create interview campaigns and assign them. You can only create or see campaigns within your own scope.</p>
      {sp.e && <div className="notice error">{sp.e}</div>}
      {sp.ok && <div className="notice ok">{sp.ok}</div>}

      <h2>Question set</h2>
      <div className="card row">
        <div className="grow">
          {tCount.department} department questions · {tCount.process} process questions active.
          <div className="muted small">The starter set is generic (no company facts). Loading requires company-wide interview management.</div>
        </div>
        <form action={loadTemplates.bind(null, companyId)}><button className="secondary" type="submit">Load starter questions</button></form>
      </div>

      <h2>New campaign</h2>
      <form action={createCampaign.bind(null, companyId)} className="card">
        <div className="grid2">
          <div><label htmlFor="code">Code</label><input id="code" name="code" required placeholder="OPS-DISC-01" /></div>
          <div><label htmlFor="name">Name</label><input id="name" name="name" required placeholder="Operations discovery — round 1" /></div>
          <div><label htmlFor="department_id">Department</label>
            <select id="department_id" name="department_id" required>
              {(deps.data ?? []).map((d) => <option key={d.id} value={d.id}>{d.code} · {d.name}</option>)}
            </select></div>
          <div><label htmlFor="process_id">Process (optional)</label>
            <select id="process_id" name="process_id" defaultValue="">
              <option value="">— Department-level —</option>
              {(procs.data ?? []).map((p) => <option key={p.id} value={p.id}>{p.code} · {p.name}</option>)}
            </select></div>
          <div><label htmlFor="due_on">Due date</label><input id="due_on" name="due_on" type="date" /></div>
        </div>
        <label htmlFor="purpose">Purpose (shown to respondents)</label>
        <textarea id="purpose" name="purpose" placeholder="Why we are asking and how answers will be used." />
        <div style={{ marginTop: 12 }}><button type="submit">Create campaign</button></div>
      </form>

      <h2>Campaigns</h2>
      {!campaigns.data?.length && <p className="muted">No campaigns in your scope yet.</p>}
      {campaigns.data?.map((c) => {
        const mine = (assignments.data ?? []).filter((a) => a.campaign_id === c.id);
        return (
          <div key={c.id} className="card">
            <div className="row"><strong className="grow">{c.code} · {c.name}</strong><span className="badge">{c.status}</span></div>
            <div className="muted small">{c.department_id ? depName.get(c.department_id) : ""}{c.due_on ? ` · due ${c.due_on}` : ""}</div>
            {mine.length > 0 && (
              <ul className="small">
                {mine.map((a) => <li key={a.id}>{memberLabel.get(a.respondent_membership_id) ?? "Member"} — {a.status.replace("_", " ")}
                  {a.status !== "invited" && <> · <Link href={`/c/${companyId}/interviews/${a.id}`}>view answers</Link></>}</li>)}
              </ul>
            )}
            <form action={createAssignment.bind(null, companyId)} className="grid2" style={{ marginTop: 8 }}>
              <input type="hidden" name="campaign_id" value={c.id} />
              <input type="hidden" name="department_id" value={c.department_id ?? ""} />
              <input type="hidden" name="process_id" value={c.process_id ?? ""} />
              <div><label htmlFor={`r-${c.id}`}>Assign to</label>
                <select id={`r-${c.id}`} name="respondent_membership_id" required>
                  {(members.data ?? []).map((m) => <option key={m.id} value={m.id}>{memberLabel.get(m.id)}</option>)}
                </select></div>
              <div style={{ alignSelf: "end" }}><button type="submit" disabled={!c.department_id}>Assign interview</button></div>
            </form>
          </div>
        );
      })}
    </>
  );
}
