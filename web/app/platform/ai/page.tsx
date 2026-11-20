import { nowMs } from "@/lib/time";
import { requirePlatformAdmin } from "@/lib/session";
import { fmtDate } from "@/lib/names";
import { PROVIDERS } from "@/lib/ai-pool";
import { AddKeys, TestKey } from "./pool-tools";
import { removeKey, updateKey } from "./actions";

const HEALTH: Record<string, [string, string]> = {
  connected: ["Connected and tested", "ok"], configured: ["Stored, not tested yet", ""], untested: ["Not tested yet", ""],
  rate_limited: ["Resting (rate limit)", "warn"], provider_error: ["Temporary provider error", "warn"], auth_failed: ["Key rejected", "danger"],
  model_unavailable: ["Model not available", "danger"], not_configured: ["Not configured", "danger"], removed: ["Removed", ""],
};

/** Platform AI pool (PPI-040, D-095): shared keys for companies without their own AI connections. */
export default async function AiPool({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const { supabase } = await requirePlatformAdmin();
  const { data } = await supabase.from("ai_pool_keys").select("id, provider, label, model, priority, status, health, key_hint, last_tested_at, last_success_at, cooldown_until, uses_today, uses_day, uses_total, available_models")
    .order("provider").order("priority").order("label");
  const keys = data ?? [];
  const now = nowMs();
  const today = new Date(now + 5.5 * 3600e3).toISOString().slice(0, 10);
  const live = keys.filter((k) => k.health !== "removed");
  const resting = (k: (typeof keys)[number]) => !!k.cooldown_until && Date.parse(k.cooldown_until) > now;
  const byProv = Object.keys(PROVIDERS).map((p) => {
    const ks = live.filter((k) => k.provider === p);
    return { p, n: ks.length, ok: ks.filter((k) => k.health === "connected" && k.status === "active").length, rest: ks.filter(resting).length,
      today: ks.reduce((t, k) => t + (k.uses_day === today ? k.uses_today : 0), 0) };
  }).filter((r) => r.n > 0);

  return (
    <>
      <h1>AI pool</h1>
      <p className="muted">Shared AI keys for companies that have not connected their own. Each company always uses the same key of a provider; if that key is resting
        after a rate limit, the work moves to <strong>another provider</strong> (or waits) — never to a sibling key of the same provider, as the providers&rsquo; terms require.
        Each company&rsquo;s data policy decides which providers may see which data.</p>
      {sp.e && <div className="notice error">{sp.e}</div>}
      {sp.ok && <div className="notice ok">{sp.ok}</div>}

      <div className="kpis" data-testid="pool-kpis">
        <div className="kpi"><div className="kpi-label">Keys in the pool</div><div className="kpi-value">{live.length}</div><div className="kpi-sub">{byProv.length} provider{byProv.length === 1 ? "" : "s"}</div></div>
        <div className={`kpi ${live.length && !live.some((k) => k.health === "connected") ? "attn" : ""}`}><div className="kpi-label">Connected and tested</div><div className="kpi-value">{live.filter((k) => k.health === "connected").length}</div></div>
        <div className={`kpi ${live.some(resting) ? "attn" : ""}`}><div className="kpi-label">Resting now</div><div className="kpi-value">{live.filter(resting).length}</div></div>
        <div className="kpi"><div className="kpi-label">AI calls today</div><div className="kpi-value">{byProv.reduce((t, r) => t + r.today, 0)}</div></div>
      </div>
      {byProv.length > 0 && (
        <div className="table-wrap card" style={{ padding: 0 }}>
          <table data-testid="pool-providers">
            <thead><tr><th>Provider</th><th className="num">Keys</th><th className="num">Connected</th><th className="num">Resting</th><th className="num">Calls today</th><th>Data allowed (default policy)</th></tr></thead>
            <tbody>{byProv.map((r) => <tr key={r.p}><td>{PROVIDERS[r.p]!.label}</td><td className="num">{r.n}</td><td className="num">{r.ok}</td><td className="num">{r.rest}</td><td className="num">{r.today}</td>
              <td className="small" style={{ whiteSpace: "normal" }}>{PROVIDERS[r.p]!.note}</td></tr>)}</tbody>
          </table>
        </div>)}

      <AddKeys />

      <div className="row" style={{ justifyContent: "space-between", marginTop: 16 }}>
        <h2 style={{ margin: 0 }}>Keys</h2>{live.length > 0 && <TestKey label="Test all keys" />}
      </div>
      {keys.length === 0 ? <p className="muted" data-testid="pool-empty">No keys yet. Add keys above — they are stored encrypted and tested with a real request.</p> : (
        <div className="table-wrap card" style={{ padding: 0 }}>
          <table data-testid="pool-keys">
            <thead><tr><th>Key</th><th>Provider · model</th><th>Health</th><th className="num">Calls today</th><th>Last success</th><th /></tr></thead>
            <tbody>{keys.map((k) => {
              const [hl, hc] = resting(k) ? ["Resting until " + new Date(k.cooldown_until!).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" }), "warn"] : HEALTH[k.health] ?? [k.health, ""];
              return (
                <tr key={k.id} style={k.health === "removed" ? { opacity: 0.55 } : undefined}>
                  <td><strong>{k.label}</strong><div className="small muted mono">••••{k.key_hint}{k.status === "disabled" && k.health !== "removed" ? " · paused" : ""}</div></td>
                  <td className="small">{PROVIDERS[k.provider]?.label ?? k.provider}<div className="mono">{k.model}</div></td>
                  <td><span className={`badge ${hc}`}>{hl}</span>{k.last_tested_at && <div className="small muted">tested {fmtDate(k.last_tested_at)}</div>}</td>
                  <td className="num">{k.uses_day === today ? k.uses_today : 0}<div className="small muted">{k.uses_total} total</div></td>
                  <td className="small">{fmtDate(k.last_success_at)}</td>
                  <td>{k.health !== "removed" && (
                    <details>
                      <summary className="small">Manage</summary>
                      <div style={{ minWidth: 260, paddingTop: 6 }}>
                        <TestKey id={k.id} />
                        <form action={updateKey.bind(null, k.id)} style={{ marginTop: 8 }}>
                          <label htmlFor={`m-${k.id}`}>Model</label>
                          <input id={`m-${k.id}`} name="model" defaultValue={k.model} list={`ml-${k.id}`} />
                          {k.available_models.length > 0 && <datalist id={`ml-${k.id}`}>{k.available_models.map((m) => <option key={m} value={m} />)}</datalist>}
                          <div className="grid2">
                            <div><label htmlFor={`l-${k.id}`}>Name</label><input id={`l-${k.id}`} name="label" defaultValue={k.label} /></div>
                            <div><label htmlFor={`p-${k.id}`}>Priority (lower first)</label><input id={`p-${k.id}`} name="priority" type="number" min={1} max={1000} defaultValue={k.priority} /></div>
                          </div>
                          <label htmlFor={`s-${k.id}`}>Status</label>
                          <select id={`s-${k.id}`} name="status" defaultValue={k.status}><option value="active">In use</option><option value="disabled">Paused</option></select>
                          <button type="submit" className="secondary" style={{ marginTop: 6 }}>Save</button>
                        </form>
                        <form action={removeKey.bind(null, k.id)} style={{ marginTop: 8 }}>
                          <label className="row small" style={{ gap: 6 }}><input type="checkbox" name="confirm" value="yes" style={{ width: "auto" }} /> Remove permanently (deletes the key from the vault)</label>
                          <button type="submit" className="secondary">Remove</button>
                        </form>
                      </div>
                    </details>)}
                  </td>
                </tr>);
            })}</tbody>
          </table>
        </div>)}
      <p className="small muted">Recommendation: free tiers are for trials and demos. For live client work, use a paid key (no training, higher limits) — add it as
        “Other OpenAI-compatible endpoint” or as a company&rsquo;s own AI connection.</p>
    </>
  );
}
