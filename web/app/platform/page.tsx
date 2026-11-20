import { nowMs } from "@/lib/time";
import Link from "next/link";
import { requirePlatformAdmin } from "@/lib/session";

const n = (x: number) => x.toLocaleString("en-IN");

/** Super admin overview: the whole platform at a glance (figures only — D-091). */
export default async function PlatformHome() {
  const { supabase } = await requirePlatformAdmin();
  const { data: cos } = await supabase.rpc("platform_companies");
  const rows = (cos ?? []).filter((c) => !c.code.startsWith("E2E"));
  const sum = (k: keyof (typeof rows)[number]) => rows.reduce((s, r) => s + (Number(r[k]) || 0), 0);
  const live = rows.filter((r) => r.status === "active" || r.status === "trial");
  const quiet = live.filter((r) => !r.last_activity || nowMs() - Date.parse(r.last_activity) > 7 * 864e5);
  return (
    <>
      <h1>Platform overview</h1>
      <p className="muted">All client companies (test tenants excluded). Figures only — client conversations and documents stay private to each company.</p>
      <div className="kpis" data-testid="platform-kpis">
        <div className="kpi"><div className="kpi-label">Companies</div><div className="kpi-value">{n(live.length)}</div><div className="kpi-sub">{rows.filter((r) => r.status === "trial").length} on trial</div></div>
        <div className="kpi"><div className="kpi-label">People taking part</div><div className="kpi-value">{n(sum("members_active"))}</div><div className="kpi-sub">{n(sum("members_invited"))} invited</div></div>
        <div className="kpi"><div className="kpi-label">Interviews completed</div><div className="kpi-value">{n(sum("interviews_submitted"))}</div><div className="kpi-sub">of {n(sum("interviews_started"))} started</div></div>
        <div className="kpi"><div className="kpi-label">Processes discovered</div><div className="kpi-value">{n(sum("processes_found"))}</div><div className="kpi-sub">{n(sum("company_processes"))} consolidated · {n(sum("validated"))} validated</div></div>
        <div className="kpi"><div className="kpi-label">Documents approved</div><div className="kpi-value">{n(sum("documents_approved"))}</div></div>
        <div className="kpi"><div className="kpi-label">AI runs (30 days)</div><div className="kpi-value">{n(sum("ai_runs_30d"))}</div></div>
      </div>
      {quiet.length > 0 && (
        <div className="notice" data-testid="quiet">
          <strong>Needs a nudge:</strong> {quiet.map((q) => q.name).join(", ")} — no activity in the last 7 days.
        </div>
      )}
      <p><Link href="/platform/companies">All companies →</Link></p>
    </>
  );
}
