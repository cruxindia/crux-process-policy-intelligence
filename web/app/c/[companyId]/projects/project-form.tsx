// Shared create / edit form for an engagement project (server component; posts to a server action).
type Opt = { id: string; name: string };
export type ProjectRow = { id: string; code: string; name: string; objective: string | null; manager_membership_id: string | null; sponsor_membership_id: string | null;
  department_ids: string[]; starts_on: string | null; target_end_on: string | null; status: string };

export const PROJECT_STATUS: Record<string, string> = { planning: "Planning", active: "Active", on_hold: "On hold", completed: "Completed", cancelled: "Cancelled" };

export function ProjectForm({ action, people, depts, p, submit }: { action: (f: FormData) => void | Promise<void>; people: Opt[]; depts: Opt[]; p?: ProjectRow; submit: string }) {
  return (
    <form action={action} data-testid="project-form">
      <div className="grid2">
        <div><label htmlFor="pr-name">Project name</label><input id="pr-name" name="name" required minLength={3} maxLength={120} defaultValue={p?.name} placeholder="e.g. Operations process discovery — wave 1" /></div>
        <div><label htmlFor="pr-code">Short code</label><input id="pr-code" name="code" required pattern="[A-Za-z0-9][A-Za-z0-9\-]{1,19}" defaultValue={p?.code} placeholder="OPS-W1" /></div>
        <div><label htmlFor="pr-mgr">Project manager</label>
          <select id="pr-mgr" name="manager" defaultValue={p?.manager_membership_id ?? ""}><option value="">— choose —</option>{people.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></div>
        <div><label htmlFor="pr-sp">Sponsor (stakeholder)</label>
          <select id="pr-sp" name="sponsor" defaultValue={p?.sponsor_membership_id ?? ""}><option value="">— choose —</option>{people.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></div>
        <div><label htmlFor="pr-start">Start</label><input id="pr-start" name="starts" type="date" defaultValue={p?.starts_on ?? ""} /></div>
        <div><label htmlFor="pr-end">Target end</label><input id="pr-end" name="target_end" type="date" defaultValue={p?.target_end_on ?? ""} /></div>
      </div>
      <label htmlFor="pr-obj">Objective</label>
      <textarea id="pr-obj" name="objective" rows={2} maxLength={2000} defaultValue={p?.objective ?? ""} placeholder="What will be true when this project is done?" />
      <fieldset style={{ border: 0, padding: 0, margin: "8px 0" }}><legend className="small">Departments in scope (none ticked = whole company)</legend>
        <div className="row" style={{ gap: 12 }}>{depts.map((dp) => (
          <label key={dp.id} className="row small" style={{ gap: 4 }}><input type="checkbox" name="departments" value={dp.id} defaultChecked={p?.department_ids.includes(dp.id)} style={{ width: "auto" }} />{dp.name}</label>))}</div>
      </fieldset>
      {p && <><label htmlFor="pr-st">Status</label>
        <select id="pr-st" name="status" defaultValue={p.status}>{Object.entries(PROJECT_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></>}
      <button type="submit" style={{ marginTop: 10 }}>{submit}</button>
    </form>
  );
}
