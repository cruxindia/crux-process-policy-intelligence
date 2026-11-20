import Link from "next/link";
import { nowMs } from "@/lib/time";
import { requireMembership } from "@/lib/session";
import { memberNames } from "@/lib/names";
import { saveProject } from "./actions";
import { PROJECT_STATUS, ProjectForm } from "./project-form";

/** Engagement projects (D-097): who runs what, by when, and how far it is. */
export default async function Projects({ params, searchParams }: { params: Promise<{ companyId: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { companyId } = await params; const sp = await searchParams;
  const { supabase, permissions } = await requireMembership(companyId);
  const [{ data: projects }, { data: ms }, { members }, { data: depts }] = await Promise.all([
    supabase.from("projects").select("id, code, name, status, manager_membership_id, sponsor_membership_id, starts_on, target_end_on").eq("company_id", companyId).order("status").order("code"),
    supabase.from("project_milestones").select("project_id, due_on, done_at").eq("company_id", companyId),
    memberNames(supabase, companyId),
    supabase.from("departments").select("id, name").eq("company_id", companyId).eq("status", "active").order("name"),
  ]);
  const names = new Map(members.map((m) => [m.id, m.name]));
  const today = new Date(nowMs() + 5.5 * 3600e3).toISOString().slice(0, 10);
  const can = permissions.has("project.manage");
  return (
    <>
      <h1>Projects</h1>
      <p className="muted">Each project has a manager, a sponsor, the departments in scope and milestones. Managers and sponsors see their project&rsquo;s live dashboard.</p>
      {sp.e && <div className="notice error">{sp.e}</div>}
      {!projects?.length ? <p className="muted" data-testid="projects-empty">No projects yet.{can ? " Start one below." : ""}</p> : (
        <div className="table-wrap card" style={{ padding: 0 }}>
          <table data-testid="projects-table">
            <thead><tr><th>Project</th><th>Status</th><th>Manager</th><th>Sponsor</th><th>Timeline</th><th>Milestones</th></tr></thead>
            <tbody>{projects.map((p) => {
              const mine = (ms ?? []).filter((m) => m.project_id === p.id); const done = mine.filter((m) => m.done_at).length;
              const late = mine.filter((m) => !m.done_at && m.due_on && m.due_on < today).length;
              return (
                <tr key={p.id}>
                  <td><Link href={`/c/${companyId}/projects/${p.id}`}><strong>{p.name}</strong></Link><div className="small mono muted">{p.code}</div></td>
                  <td><span className={`badge ${p.status === "active" ? "ok" : p.status === "on_hold" ? "warn" : ""}`}>{PROJECT_STATUS[p.status]}</span></td>
                  <td className="small">{names.get(p.manager_membership_id ?? "") ?? "—"}</td><td className="small">{names.get(p.sponsor_membership_id ?? "") ?? "—"}</td>
                  <td className="small">{p.starts_on ?? "?"} → {p.target_end_on ?? "?"}{p.target_end_on && p.target_end_on < today && !["completed", "cancelled"].includes(p.status) && <span className="badge warn" style={{ marginLeft: 6 }}>past target</span>}</td>
                  <td style={{ minWidth: 140 }}><div className="small">{done} of {mine.length}{late > 0 && <span className="badge warn" style={{ marginLeft: 6 }}>{late} late</span>}</div>
                    <div className="bar thin"><div style={{ width: `${mine.length ? (100 * done) / mine.length : 0}%` }} /></div></td>
                </tr>);
            })}</tbody>
          </table>
        </div>)}
      {can && (
        <details className="card" open={!projects?.length}>
          <summary><strong>Start a new project</strong></summary>
          <ProjectForm action={saveProject.bind(null, companyId, null)} people={members.filter((m) => m.status === "active")} depts={depts ?? []} submit="Create project" />
        </details>)}
    </>
  );
}
