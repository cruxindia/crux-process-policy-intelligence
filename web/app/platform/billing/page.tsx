import Link from "next/link";
import { requirePlatformAdmin } from "@/lib/session";
import { inr } from "@/components/invoice-view";
import { generate, subscribe } from "./actions";

const STATUS: Record<string, string> = { draft: "Draft", issued: "Issued", paid: "Paid", void: "Void" };

export default async function PlatformBilling({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const { supabase } = await requirePlatformAdmin();
  const [{ data: overview }, { data: plans }, { data: invoices }, { data: settings }, { data: cos }] = await Promise.all([
    supabase.rpc("platform_billing_overview"),
    supabase.from("billing_plans").select("id, name, code, company_id, monthly_fee, is_draft_price").eq("status", "active").order("sort_order"),
    supabase.from("invoices").select("id, company_id, number, status, disputed, proforma, period_start, total, due_on").order("period_start", { ascending: false }).limit(200),
    supabase.rpc("platform_billing_settings"),
    supabase.rpc("platform_companies"),
  ]);
  const rows = (overview ?? []).filter((r) => !(cos ?? []).find((c) => c.company_id === r.company_id)?.code.startsWith("E2E") || sp.test === "1");
  const name = new Map((cos ?? []).map((c) => [c.company_id, c.name]));
  const mrr = rows.reduce((t, r) => t + Number(r.monthly_fee ?? 0) * (1 - Number(r.discount_pct ?? 0) / 100), 0);
  const cfg = (settings ?? {}) as Record<string, string>;
  const incomplete = ["billing_legal_name", "billing_gstin", "billing_address", "billing_state_code"].some((k) => !cfg[k]);
  const draftPrices = (plans ?? []).some((p) => p.is_draft_price);
  const lastMonth = new Date(); lastMonth.setDate(1); lastMonth.setMonth(lastMonth.getMonth() - 1);
  return (
    <>
      <h1>Billing</h1>
      {sp.e && <div className="notice error">{sp.e}</div>}
      {sp.ok && <div className="notice ok">{sp.ok}</div>}
      {(incomplete || draftPrices) && (
        <div className="notice" data-testid="billing-setup">
          <strong>Before the first real invoice:</strong>
          <ul style={{ margin: "6px 0 0" }}>
            {draftPrices && <li>The example packages still have <strong>draft prices</strong> — set your prices in <Link href="/platform/billing/plans">Packages</Link>.</li>}
            {incomplete && <li>Your <Link href="/platform/billing/settings">billing profile</Link> (legal name, GSTIN, address, state) is incomplete — invoices stay “proforma” until it is.</li>}
          </ul>
        </div>)}
      <div className="kpis">
        <div className="kpi"><div className="kpi-label">Monthly recurring (base fees)</div><div className="kpi-value">{inr(mrr)}</div><div className="kpi-sub">before usage and GST</div></div>
        <div className="kpi"><div className="kpi-label">Outstanding</div><div className="kpi-value">{inr(rows.reduce((t, r) => t + Number(r.outstanding), 0))}</div></div>
        <div className={`kpi ${rows.some((r) => Number(r.overdue) > 0) ? "attn" : ""}`}><div className="kpi-label">Overdue</div><div className="kpi-value">{inr(rows.reduce((t, r) => t + Number(r.overdue), 0))}</div></div>
        <div className={`kpi ${rows.some((r) => r.disputed) ? "attn" : ""}`}><div className="kpi-label">Disputed invoices</div><div className="kpi-value">{rows.reduce((t, r) => t + r.disputed, 0)}</div></div>
      </div>
      <div className="row"><Link className="button secondary" href="/platform/billing/plans">Packages</Link><Link className="button secondary" href="/platform/billing/settings">Billing profile</Link></div>

      <h2>Companies and packages</h2>
      <div className="table-wrap card" style={{ padding: 0 }}>
        <table data-testid="billing-companies">
          <thead><tr><th>Company</th><th>Package</th><th className="num">Discount</th><th className="num">Invoiced</th><th className="num">Outstanding</th><th>Change package</th></tr></thead>
          <tbody>{rows.map((r) => (
            <tr key={r.company_id}>
              <td>{r.company_name}</td><td>{r.plan_name ?? <span className="muted">none</span>}</td><td className="num">{r.discount_pct ? `${r.discount_pct}%` : "—"}</td>
              <td className="num">{inr(r.invoiced_total)}</td><td className="num">{inr(r.outstanding)}</td>
              <td>
                <form action={subscribe} className="row" style={{ flexWrap: "nowrap", gap: 6 }}>
                  <input type="hidden" name="company" value={r.company_id} />
                  <select name="plan" required aria-label={`Package for ${r.company_name}`} defaultValue="" style={{ width: 160 }}>
                    <option value="" disabled>Choose…</option>
                    {(plans ?? []).filter((p) => !p.company_id || p.company_id === r.company_id).map((p) => <option key={p.id} value={p.id}>{p.name}{p.company_id ? " (custom)" : ""}</option>)}
                  </select>
                  <input name="discount" type="number" min={0} max={100} step="0.5" placeholder="% off" aria-label={`Discount for ${r.company_name}`} style={{ width: 80 }} />
                  <input name="starts" type="date" aria-label={`Package starts for ${r.company_name}`} title="Starts on (first month is charged pro rata)" style={{ width: 150 }} />
                  {sp.test === "1" && <input type="hidden" name="back" value="/platform/billing?test=1" />}
                  <button type="submit" className="secondary">Set</button>
                </form>
              </td>
            </tr>))}
          </tbody>
        </table>
      </div>

      <h2>Invoices</h2>
      <form action={generate} className="card row" style={{ alignItems: "flex-end" }}>
        <div><label htmlFor="g-month" style={{ marginTop: 0 }}>Prepare invoices for</label>
          <input id="g-month" name="month" type="month" required defaultValue={lastMonth.toISOString().slice(0, 7)} style={{ width: 180 }} /></div>
        {sp.test === "1" && <input type="hidden" name="back" value="/platform/billing?test=1" />}
        <button type="submit">Prepare invoices</button>
        <span className="muted small">Runs automatically on the 1st of each month for the previous month. Drafts are recalculated until you issue them.</span>
      </form>
      <div className="table-wrap card" style={{ padding: 0 }}>
        <table data-testid="invoices-table">
          <thead><tr><th>Invoice</th><th>Company</th><th>Month</th><th className="num">Total</th><th>Status</th><th>Due</th></tr></thead>
          <tbody>{(invoices ?? []).map((i) => (
            <tr key={i.id}>
              <td><Link href={`/platform/billing/invoices/${i.id}`} className="mono">{i.number ?? "Draft"}</Link></td>
              <td>{name.get(i.company_id) ?? "—"}</td><td>{new Date(i.period_start).toLocaleDateString("en-IN", { month: "short", year: "numeric" })}</td>
              <td className="num">{inr(i.total)}</td>
              <td><span className={`badge ${i.status === "paid" ? "ok" : i.status === "issued" ? "part" : i.status === "void" ? "" : "warn"}`}>{STATUS[i.status]}</span>
                {i.disputed && <> <span className="badge danger">disputed</span></>}{i.proforma && i.status !== "draft" && <> <span className="badge">proforma</span></>}</td>
              <td className="small">{i.due_on ?? "—"}</td>
            </tr>))}
          </tbody>
        </table>
      </div>
    </>
  );
}
