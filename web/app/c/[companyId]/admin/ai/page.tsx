// Administrator: AI connections, routing assignments, queue and usage (Master Corrective Prompt v2.0, Parts 5-7).
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireMembership } from "@/lib/session";
import { fmtDate } from "@/lib/names";
import { addAssignment, addConnection, setAssignmentActive, updateConnection } from "./actions";
import { KeyForm, TestButton } from "./connection-tools";

const HEALTH: Record<string, [string, string]> = {
  untested: ["Not tested yet", ""], not_configured: ["Not configured", "warn"], configured: ["Configuration found (not tested)", ""],
  connected: ["Connected and tested", "ok"], auth_failed: ["Authentication failed", "danger"], model_unavailable: ["Model unavailable", "danger"],
  rate_limited: ["Rate limited", "warn"], provider_error: ["Temporary provider error", "warn"],
};
/** Server component: rendered once per request, so "now" is the request time. */
const requestTime = () => Date.now();
const CAT: Record<string, string> = { discovery: "Discovery conversations", adaptive: "Adaptive interviews", review: "Review", documents: "Documents" };

export default async function AiAdmin({ params, searchParams }: { params: Promise<{ companyId: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { companyId } = await params;
  const sp = await searchParams;
  const { supabase, permissions } = await requireMembership(companyId);
  if (!permissions.has("org.manage")) notFound();
  const now = requestTime();
  const since = new Date(now - 7 * 86400_000).toISOString();
  const [{ data: conns }, { data: asg }, { data: depts }, { data: procs }, { data: pols }, { data: co }, { data: jobs }, runsRes] = await Promise.all([
    supabase.from("ai_provider_connections").select("id, name, provider, policy_provider, gcp_project_id, model, base_url, priority, status, vault_secret_id, key_set_at, health, last_tested_at, last_success_at, last_error_class, last_error_at, cooldown_until")
      .eq("company_id", companyId).order("priority").order("name"),
    supabase.from("ai_connection_assignments").select("id, connection_id, department_id, process_id, interview_category, active").eq("company_id", companyId),
    supabase.from("departments").select("id, code, name").eq("company_id", companyId).order("code"),
    supabase.from("processes").select("id, code, name").eq("company_id", companyId).order("code"),
    supabase.from("ai_provider_policies").select("provider, max_classification").eq("company_id", companyId).order("provider"),
    supabase.from("companies").select("ai_connection_limit").eq("id", companyId).single(),
    supabase.from("ai_jobs").select("id, task_type, status, run_after, retry_count, error_class, created_at, completed_at, connection_id").eq("company_id", companyId)
      .order("created_at", { ascending: false }).limit(50),
    permissions.has("audit.read")
      ? supabase.from("ai_runs").select("connection_id, provider, status, error_text, created_at, finished_at").eq("company_id", companyId).gte("created_at", since).limit(5000)
      : Promise.resolve({ data: null }),
  ]);
  const runs = runsRes.data;
  const dName = new Map((depts ?? []).map((d) => [d.id, `${d.code} · ${d.name}`]));
  const pName = new Map((procs ?? []).map((p) => [p.id, `${p.code} · ${p.name}`]));
  const cName = new Map((conns ?? []).map((c) => [c.id, c.name]));
  const usage = new Map<string, { ok: number; failed: number; ms: number[]; today: number }>();
  const dayStart = new Date(now); dayStart.setUTCHours(0, 0, 0, 0);
  for (const r of runs ?? []) {
    const k = r.connection_id ?? "default";
    const u = usage.get(k) ?? { ok: 0, failed: 0, ms: [], today: 0 };
    if (r.status === "succeeded") u.ok++; else if (r.status === "failed") u.failed++;
    if (r.finished_at) u.ms.push(Date.parse(r.finished_at) - Date.parse(r.created_at));
    if (Date.parse(r.created_at) >= dayStart.getTime()) u.today++;
    usage.set(k, u);
  }
  const failures = new Map<string, number>();
  for (const r of runs ?? []) if (r.status === "failed") failures.set(r.error_text ?? "unknown", (failures.get(r.error_text ?? "unknown") ?? 0) + 1);
  const queued = (jobs ?? []).filter((j) => j.status === "queued");
  const policyOptions = (pols ?? []).map((p) => <option key={p.provider} value={p.provider}>{p.provider} (up to {p.max_classification})</option>);

  const connForm = (c?: NonNullable<typeof conns>[number]) => (
    <div className="grid2">
      <label>Name<input name="name" required minLength={2} maxLength={80} defaultValue={c?.name ?? ""} placeholder="e.g. Operations — Gemini project A" /></label>
      <label>Provider<select name="provider" defaultValue={c?.provider ?? "gemini"}><option value="gemini">Google Gemini</option><option value="ollama">Ollama (self-hosted)</option></select></label>
      <label>Google Cloud project ID<input name="gcp_project_id" defaultValue={c?.gcp_project_id ?? ""} placeholder="for your records, e.g. policy-tool-ops" /></label>
      <label>Model<input name="model" defaultValue={c?.model ?? "gemini-flash-lite-latest"} /></label>
      <label>Data policy<select name="policy_provider" defaultValue={c?.policy_provider ?? "gemini_free"}>{policyOptions}</select></label>
      <label>Priority (1 = tried first)<input name="priority" type="number" min={1} max={1000} defaultValue={c?.priority ?? 100} /></label>
      <label>Ollama URL (Ollama only)<input name="base_url" defaultValue={c?.base_url ?? ""} placeholder="https://…" /></label>
      {c && <label>Status<select name="status" defaultValue={c.status}><option value="active">Active</option><option value="disabled">Disabled</option></select></label>}
    </div>
  );

  return (
    <>
      <p><Link href={`/c/${companyId}/admin`}>← Administration</Link></p>
      <h1>AI connections</h1>
      <p className="muted">Each connection is one AI project (for example one Google Cloud project with its own Gemini key). Assign connections to departments,
        processes or interview types; work is routed to the most specific active connection, then to shared connections (no assignments), then to the
        server&rsquo;s default key. When a connection hits its provider limit it rests until the provider&rsquo;s own reset time — keys are never rotated to get
        around limits. Keys are kept in Supabase Vault and are never shown again.</p>
      {sp.e && <div className="notice error">{sp.e}</div>}
      {sp.ok && <div className="notice ok">{sp.ok}</div>}

      <div className="card row" style={{ justifyContent: "space-between" }}>
        <div><strong>Server default key</strong><div className="muted small">Used when no connection is assigned or available (Edge Function secret GEMINI_API_KEY).</div></div>
        <TestButton companyId={companyId} label="Test default" />
      </div>

      <h2>Connections ({conns?.length ?? 0} of {co?.ai_connection_limit ?? 10})</h2>
      {!conns?.length && <p className="muted">No connections yet — everything uses the server default key.</p>}
      {conns?.map((c) => {
        const [hl, hc] = HEALTH[c.health] ?? [c.health, ""];
        const mine = (asg ?? []).filter((a) => a.connection_id === c.id);
        const u = usage.get(c.id);
        const cooling = c.cooldown_until && Date.parse(c.cooldown_until) > now;
        return (
          <details key={c.id} className="card" data-testid="connection">
            <summary className="row" style={{ justifyContent: "space-between", cursor: "pointer" }}>
              <span><strong>{c.name}</strong> <span className="muted small">· {c.provider} · {c.model} · priority {c.priority}{c.status === "disabled" ? " · disabled" : ""}</span></span>
              <span className={`badge ${hc}`} data-testid="health">{hl}{cooling ? ` · resting until ${fmtDate(c.cooldown_until)}` : ""}</span>
            </summary>
            <div className="small muted" style={{ margin: "8px 0" }}>
              Key: {c.vault_secret_id ? `stored in Vault${c.key_set_at ? ` (${fmtDate(c.key_set_at)})` : ""}` : c.provider === "ollama" ? "not needed" : "not stored yet"}
              {" · "}Last test: {c.last_tested_at ? fmtDate(c.last_tested_at) : "never"}{c.last_success_at ? ` · last success ${fmtDate(c.last_success_at)}` : ""}
              {c.last_error_class ? ` · last error: ${c.last_error_class} (${fmtDate(c.last_error_at)})` : ""}
              {u ? ` · 7 days: ${u.ok} ok / ${u.failed} failed, today ${u.today}` : ""}
            </div>
            <div className="row" style={{ gap: 12, flexWrap: "wrap" }}>
              {c.provider === "gemini" && <KeyForm companyId={companyId} connectionId={c.id} hasKey={!!c.vault_secret_id} />}
              <TestButton companyId={companyId} connectionId={c.id} />
            </div>
            <h3 className="small" style={{ marginTop: 12 }}>Assigned to</h3>
            {mine.length === 0 ? <p className="small muted">Nothing — this is a shared connection for all departments.</p> : (
              <ul className="small">{mine.map((a) => (
                <li key={a.id} style={{ opacity: a.active ? 1 : 0.55 }}>
                  {[a.department_id && `Department ${dName.get(a.department_id) ?? "?"}`, a.process_id && `Process ${pName.get(a.process_id) ?? "?"}`,
                    a.interview_category && CAT[a.interview_category]].filter(Boolean).join(" · ")}{a.active ? "" : " (off)"}{" "}
                  <form action={setAssignmentActive.bind(null, companyId, a.id, !a.active)} style={{ display: "inline" }}>
                    <button type="submit" className="linkish">{a.active ? "switch off" : "switch on"}</button></form>
                </li>
              ))}</ul>
            )}
            <form action={addAssignment.bind(null, companyId, c.id)} className="row" style={{ gap: 6, flexWrap: "wrap" }}>
              <select name="department_id" aria-label="Department"><option value="">Any department</option>{(depts ?? []).map((d) => <option key={d.id} value={d.id}>{d.code} · {d.name}</option>)}</select>
              <select name="process_id" aria-label="Process"><option value="">Any process</option>{(procs ?? []).map((p) => <option key={p.id} value={p.id}>{p.code} · {p.name}</option>)}</select>
              <select name="interview_category" aria-label="Interview type"><option value="">Any interview type</option>{Object.entries(CAT).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
              <button type="submit" className="secondary">Assign</button>
            </form>
            <details style={{ marginTop: 10 }}><summary className="small">Edit connection</summary>
              <form action={updateConnection.bind(null, companyId, c.id)} style={{ marginTop: 8 }}>{connForm(c)}<button type="submit">Save</button></form>
            </details>
          </details>
        );
      })}

      {(conns?.length ?? 0) < (co?.ai_connection_limit ?? 10) && (
        <details className="card"><summary><strong>Add a connection</strong></summary>
          <form action={addConnection.bind(null, companyId)} style={{ marginTop: 8 }}>{connForm()}<button type="submit">Add connection</button></form>
        </details>
      )}

      <h2>Waiting work ({queued.length})</h2>
      <p className="muted small">Conversation steps that could not run (for example every connection was resting). They run automatically when the person returns
        after the time shown; employees are told their answers are saved — never that work is in progress.</p>
      {(jobs ?? []).length === 0 ? <p className="muted small">Nothing has been queued.</p> : (
        <div className="table-wrap"><table><thead><tr><th>Created</th><th>Type</th><th>Status</th><th>Next try</th><th className="num">Retries</th><th>Reason</th><th>Served by</th></tr></thead><tbody>
          {(jobs ?? []).map((j) => <tr key={j.id}><td className="small">{fmtDate(j.created_at)}</td><td>{j.task_type.replace("_", " ")}</td><td>{j.status}</td>
            <td className="small">{j.status === "queued" ? fmtDate(j.run_after) : "—"}</td><td className="num">{j.retry_count}</td><td>{j.error_class ?? ""}</td>
            <td className="small">{j.connection_id ? cName.get(j.connection_id) ?? "?" : j.status === "done" ? "Server default" : ""}</td></tr>)}
        </tbody></table></div>
      )}

      <h2>Usage — last 7 days</h2>
      {!runs ? <p className="muted small">Usage figures need the audit permission.</p> : runs.length === 0 ? <p className="muted small">No AI requests in the last 7 days.</p> : (
        <>
          <div className="table-wrap"><table><thead><tr><th>Connection</th><th className="num">Succeeded</th><th className="num">Failed</th><th className="num">Today (UTC)</th><th className="num">Median time</th></tr></thead><tbody>
            {[...usage.entries()].map(([k, u]) => {
              const ms = [...u.ms].sort((a, b) => a - b); const med = ms.length ? ms[Math.floor(ms.length / 2)]! : 0;
              return <tr key={k}><td>{k === "default" ? "Server default" : cName.get(k) ?? "Removed connection"}</td><td className="num">{u.ok}</td><td className="num">{u.failed}</td>
                <td className="num">{u.today}</td><td className="num">{(med / 1000).toFixed(1)} s</td></tr>;
            })}
          </tbody></table></div>
          {failures.size > 0 && <p className="small muted">Failures by reason: {[...failures.entries()].map(([k, v]) => `${k} ${v}`).join(" · ")}</p>}
          <p className="small muted">Counts are AI requests recorded by this system; the provider&rsquo;s own quota page (Google AI Studio) is the authority on remaining quota. Daily Gemini limits reset at midnight Pacific time.</p>
        </>
      )}
    </>
  );
}
