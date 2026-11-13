import Link from "next/link";
import { requireMembership } from "@/lib/session";
import { TEAM_COLOR } from "@/lib/board-ui";

const HEALTH: Record<string, string> = {
  untested: "Not tested", not_configured: "No key yet", configured: "Key saved (not tested)", connected: "Working",
  auth_failed: "Key rejected", model_unavailable: "Model unavailable", rate_limited: "Resting (limit reached)", provider_error: "Provider error",
};

export default async function TeamsPage({ params }: { params: Promise<{ companyId: string }> }) {
  const { companyId } = await params;
  const { supabase, permissions } = await requireMembership(companyId);
  const isAdmin = permissions.has("org.manage");
  const [{ data: teams }, { data: roles }, conns, asg] = await Promise.all([
    supabase.from("agent_teams").select("id, code, name, mission").eq("company_id", companyId).eq("status", "active").order("sort_order"),
    supabase.from("agent_roles").select("team_id, code, version, title, credentials, charter, charter_sha256, created_at").eq("company_id", companyId).eq("status", "active").order("code"),
    isAdmin ? supabase.from("ai_provider_connections").select("id, name, status, health, vault_secret_id, cooldown_until").eq("company_id", companyId).order("name") : Promise.resolve({ data: null }),
    isAdmin ? supabase.from("ai_connection_assignments").select("connection_id, interview_category, department_id, process_id, active").eq("company_id", companyId) : Promise.resolve({ data: null }),
  ]);
  const slotsFor = (cat: string) => (conns.data ?? []).filter((c) => (asg.data ?? []).some((a) => a.active && a.connection_id === c.id && a.interview_category === cat));
  const pool = (conns.data ?? []).filter((c) => !(asg.data ?? []).some((a) => a.connection_id === c.id));
  const slots = (list: NonNullable<typeof conns.data>) => !list.length ? <span className="muted small">No dedicated slot — uses the shared pool, then the server key.</span> : (
    <span className="small">{list.map((c, i) => <span key={c.id}>{i ? " · " : ""}{c.name}: <span className={`badge ${c.health === "connected" ? "ok" : c.vault_secret_id ? "warn" : ""}`}>{c.vault_secret_id ? HEALTH[c.health] ?? c.health : "No key yet"}</span></span>)}</span>);

  return (
    <>
      <p><Link href={`/c/${companyId}/board`}>← Expert board</Link></p>
      <h1>Expert teams</h1>
      <p className="muted">
        Every expert works from a written charter: responsibilities, how to critique, and hard boundaries. Charters are versioned and locked —
        a change creates a new version, and every turn on the board records the exact version used and is checked against its fingerprint
        before the expert speaks. That is what keeps the experts from drifting or forgetting their role, however long from now a case is opened.
      </p>
      {isAdmin && (
        <div className="card small">
          <strong>AI keys.</strong> Each team uses its own slot first, then the shared pool, then the server key. Paste keys in{" "}
          <Link href={`/c/${companyId}/admin/ai`}>Administration → AI connections</Link>. Shared pool: {slots(pool)}
          <div style={{ marginTop: 6 }}>Discovery interviewers: {slots(slotsFor("discovery"))}</div>
        </div>
      )}
      {(teams ?? []).filter((t) => t.code !== "interview").map((t) => (
        <section key={t.id} className="card" style={{ borderTop: `4px solid ${TEAM_COLOR[t.code] ?? "#64748b"}` }} data-testid="team">
          <h2 style={{ marginTop: 0 }}>{t.name}</h2>
          <p className="muted">{t.mission}</p>
          {isAdmin && <p>Key slots: {slots(slotsFor(`team:${t.code}`))}</p>}
          {(roles ?? []).filter((r) => r.team_id === t.id).map((r) => (
            <details key={r.code} style={{ margin: "8px 0" }}>
              <summary><strong>{r.title}</strong> <span className="muted small">· charter v{r.version} · fingerprint {r.charter_sha256.slice(0, 10)}</span></summary>
              <p className="small muted">{r.credentials}</p>
              <pre style={{ whiteSpace: "pre-wrap", fontFamily: "inherit", fontSize: ".85rem" }}>{r.charter}</pre>
            </details>
          ))}
        </section>
      ))}
      <p className="muted small">The professional standards named are how each expert reasons; they are AI roles, not certified people. Legal, tax and secretarial output must be checked by a qualified professional before use.</p>
    </>
  );
}
