import { createClient } from "@/lib/supabase/server";
import { ImportBaseline } from "./import-baseline";

/** Baseline library (PPI-046): the reference every company's register is checked against. */
export default async function BaselinePage() {
  const supabase = await createClient();
  const { data: versions } = await supabase.from("baseline_versions").select("id, code, version, title, as_of, status, counts, activated_at").order("imported_at", { ascending: false });
  const main = ["Department Register", "Process RACI Detail", "India Legal Register", "Document Dependencies", "Legal Control Mapping", "Audit Test Plan", "Legal Applicability Decisions"];
  return (
    <main>
      <h1>Baseline library</h1>
      <p className="muted">What a complete company should have — documents, end-to-end processes, laws, dependencies and audit tests. Companies adopt a baseline and every row is then found, partly found, missing or marked not applicable with a reason.</p>
      <div className="card" data-testid="baseline-list">
        {(versions ?? []).length === 0 ? <p className="muted">No baseline imported yet.</p> : (
          <table><thead><tr><th>Baseline</th><th>Version</th><th>As of</th><th>Status</th><th>Main counts</th></tr></thead><tbody>
            {(versions ?? []).map((v) => {
              const c = (v.counts ?? {}) as Record<string, { imported?: number }>;
              return (<tr key={v.id}><td><strong>{v.title}</strong><div className="small muted mono">{v.code}</div></td><td>{v.version}</td><td>{v.as_of ?? "—"}</td>
                <td><span className={`badge ${v.status === "active" ? "ok" : "warn"}`}>{v.status}</span></td>
                <td className="small">{main.filter((m) => c[m]).map((m) => `${m}: ${c[m]!.imported}`).join(" · ")}</td></tr>);
            })}</tbody></table>)}
      </div>
      <ImportBaseline />
    </main>
  );
}
