import Link from "next/link";
import { notFound } from "next/navigation";
import { nowMs } from "@/lib/time";
import { requireMembership } from "@/lib/session";
import { memberNames } from "@/lib/names";
import { DashboardView, type Dash } from "@/components/dashboard-view";
import { saveMilestone, saveProject } from "../actions";
import { PROJECT_STATUS, ProjectForm, type ProjectRow } from "../project-form";

/** Project manager's view: the project's live dashboard (its departments), milestones and settings. */
export default async function ProjectPage({ params, searchParams }: { params: Promise<{ companyId: string; projectId: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { companyId, projectId } = await params; const sp = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(projectId)) notFound();
  const { supabase, membership, permissions } = await requireMembership(companyId);
  const [{ data: p }, { data: ms }, { members }, { data: depts }, dash] = await Promise.all([
    supabase.from("projects").select("id, code, name, objective, manager_membership_id, sponsor_membership_id, department_ids, starts_on, target_end_on, status").eq("id", projectId).eq("company_id", companyId).maybeSingle(),
    supabase.from("project_milestones").select("id, title, due_on, owner_membership_id, done_at").eq("project_id", projectId).order("sort_order"),
    memberNames(supabase, companyId),
    supabase.from("departments").select("id, name").eq("company_id", companyId).eq("status", "active").order("name"),
    supabase.rpc("company_dashboard", { p_company: companyId, p_project: projectId }),
  ]);
  if (!p) notFound();
  const project = p as ProjectRow;
  const names = new Map(members.map((m) => [m.id, m.name]));
  const runner = permissions.has("project.manage") || project.manager_membership_id === membership.id;
  const today = new Date(nowMs() + 5.5 * 3600e3).toISOString().slice(0, 10);
  const scope = project.department_ids.length ? project.department_ids.map((id) => (depts ?? []).find((d) => d.id === id)?.name).filter(Boolean).join(", ") : "Whole company";
  const done = (ms ?? []).filter((m) => m.done_at).length;
  return (
    <>
      <p><Link href={`/c/${companyId}/projects`}>← Projects</Link></p>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <div><h1 style={{ marginBottom: 2 }}>{project.name}</h1>
          <div className="muted small"><span className="mono">{project.code}</span> · {PROJECT_STATUS[project.status]} · manager {names.get(project.manager_membership_id ?? "") ?? "—"} · sponsor {names.get(project.sponsor_membership_id ?? "") ?? "—"} · {scope}</div></div>
        <div className="small muted">{project.starts_on ?? "?"} → {project.target_end_on ?? "?"}</div>
      </div>
      {project.objective && <p style={{ maxWidth: 780 }}>{project.objective}</p>}
      {sp.e && <div className="notice error">{sp.e}</div>}
      {sp.ok && <div className="notice ok">{sp.ok}</div>}

      {dash.data ? <DashboardView d={dash.data as unknown as Dash} names={names} base={`/c/${companyId}`} title="Project scope" />
        : <div className="notice">The live figures are visible to the project manager, the sponsor and dashboard users.</div>}

      <section className="card" id="milestones" data-testid="milestones">
        <h2 style={{ marginTop: 0 }}>Milestones · {done} of {ms?.length ?? 0} done</h2>
        {!ms?.length ? <p className="muted">No milestones yet.</p> : (
          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>{ms.map((m) => {
            const late = !m.done_at && m.due_on && m.due_on < today;
            return (
              <li key={m.id} className="row" style={{ justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid var(--border)" }}>
                <span>{m.done_at ? "✅" : late ? "⏰" : "⬜"} <span style={m.done_at ? { textDecoration: "line-through", color: "var(--muted)" } : undefined}>{m.title}</span>
                  <span className="small muted"> · {m.due_on ? `due ${m.due_on}` : "no date"}{m.owner_membership_id ? ` · ${names.get(m.owner_membership_id) ?? ""}` : ""}</span>
                  {late && <span className="badge warn" style={{ marginLeft: 6 }}>late</span>}</span>
                {runner && <form action={saveMilestone.bind(null, companyId, projectId, m.id)}>
                  <input type="hidden" name="done" value={m.done_at ? "false" : "true"} />
                  <button type="submit" className="secondary">{m.done_at ? "Reopen" : "Mark done"}</button></form>}
              </li>);
          })}</ul>)}
        {runner && (
          <form action={saveMilestone.bind(null, companyId, projectId, null)} className="row" style={{ alignItems: "flex-end", marginTop: 10 }}>
            <div style={{ flex: 2, minWidth: 200 }}><label htmlFor="ms-title">New milestone</label><input id="ms-title" name="title" required minLength={2} maxLength={200} placeholder="e.g. All Operations interviews completed" /></div>
            <div><label htmlFor="ms-due">Due</label><input id="ms-due" name="due" type="date" /></div>
            <div><label htmlFor="ms-owner">Owner</label><select id="ms-owner" name="owner" defaultValue=""><option value="">—</option>{members.filter((m) => m.status === "active").map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></div>
            <button type="submit">Add</button>
          </form>)}
      </section>

      {runner && (
        <details className="card"><summary><strong>Project settings</strong></summary>
          <ProjectForm action={saveProject.bind(null, companyId, projectId)} people={members.filter((m) => m.status === "active")} depts={depts ?? []} p={project} submit="Save project" />
        </details>)}
    </>
  );
}
