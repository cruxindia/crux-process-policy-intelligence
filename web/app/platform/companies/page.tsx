import { requirePlatformAdmin } from "@/lib/session";
import { setCompanyStatus } from "../actions";
import { NewCompanyForm } from "./new-company";

const when = (d: string | null) => d ? new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—";
const STATUS: Record<string, string> = { trial: "Trial", active: "Active", suspended: "Suspended", archived: "Archived" };

export default async function PlatformCompanies({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const { supabase } = await requirePlatformAdmin();
  const { data: cos } = await supabase.rpc("platform_companies");
  const showTest = sp.test === "1";
  const rows = (cos ?? []).filter((c) => showTest || !c.code.startsWith("E2E"));
  return (
    <>
      <h1>Companies</h1>
      <p className="muted">Each company has its own administrators, people, AI settings and billing. {showTest ? <a href="?">Hide test tenants</a> : <a href="?test=1">Show test tenants</a>}</p>
      {sp.e && <div className="notice error">{sp.e}</div>}
      {sp.ok && <div className="notice ok">{sp.ok}</div>}
      <div className="table-wrap card" style={{ padding: 0 }}>
        <table data-testid="companies-table">
          <thead><tr><th>Company</th><th>Status</th><th className="num">People</th><th className="num">Interviews</th><th className="num">Processes</th>
            <th className="num">Validated</th><th className="num">Documents</th><th className="num">AI runs 30d</th><th>Last activity</th><th>Change status</th></tr></thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.company_id}>
                <td><strong>{c.name}</strong> <span className="muted small mono">{c.code}</span>{c.is_demo && <> <span className="badge part">demo</span></>}<div className="muted small">since {when(c.created_at)}</div></td>
                <td><span className={`badge ${c.status === "active" ? "ok" : c.status === "trial" ? "part" : "warn"}`}>{STATUS[c.status] ?? c.status}</span></td>
                <td className="num">{c.members_active}{c.members_invited ? <span className="muted small"> +{c.members_invited}</span> : null}</td>
                <td className="num">{c.interviews_submitted}/{c.interviews_started}</td>
                <td className="num">{c.processes_found}</td>
                <td className="num">{c.validated}</td>
                <td className="num">{c.documents_approved}</td>
                <td className="num">{c.ai_runs_30d}</td>
                <td>{when(c.last_activity)}</td>
                <td>
                  <form action={setCompanyStatus.bind(null, c.company_id)} className="row" style={{ flexWrap: "nowrap", gap: 6 }}>
                    <select name="status" defaultValue={c.status} aria-label={`Status of ${c.name}`} style={{ width: 120 }}>
                      {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                    <input name="note" placeholder="Reason" aria-label={`Reason for ${c.name}`} style={{ width: 140 }} />
                    <button type="submit" className="secondary">Save</button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <h2>Add a company</h2>
      <NewCompanyForm />
    </>
  );
}
