import Link from "next/link";
import { notFound } from "next/navigation";
import { requireMembership } from "@/lib/session";
import { inr } from "@/components/invoice-view";
import { saveProfile } from "./actions";

type Est = { subscribed: boolean; plan?: { name: string; monthly_fee: number; included_people: number; included_ai_runs: number; features: string[] }; discount_pct?: number;
  since?: string; usage?: { active_people: number; ai_runs: number; documents_approved: number; members_total: number };
  estimate?: { lines: { label: string; amount: number }[]; taxable: number; total: number } };

function Meter({ label, used, included }: { label: string; used: number; included: number }) {
  const pct = included ? Math.min(100, Math.round((used / included) * 100)) : 0;
  return (
    <div className="meter"><span>{label}</span><span className="small muted">{used.toLocaleString("en-IN")} of {included.toLocaleString("en-IN")} included</span>
      <div className="bar"><div className={used > included ? "over" : undefined} style={{ width: `${pct}%` }} /></div></div>
  );
}

/** Company billing (administrators): package, this month so far, invoices, billing details, disputes. */
export default async function CompanyBilling({ params, searchParams }: { params: Promise<{ companyId: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { companyId } = await params;
  const sp = await searchParams;
  const { supabase, permissions } = await requireMembership(companyId);
  if (!permissions.has("org.manage")) notFound();
  const [{ data: est }, { data: invoices }, { data: profile }] = await Promise.all([
    supabase.rpc("company_billing_estimate", { p_company: companyId }),
    supabase.from("invoices").select("id, number, status, disputed, proforma, period_start, total, due_on").eq("company_id", companyId).order("period_start", { ascending: false }),
    supabase.from("company_billing_profiles").select("*").eq("company_id", companyId).maybeSingle(),
  ]);
  const e = (est ?? { subscribed: false }) as Est;
  const open = (invoices ?? []).filter((i) => i.status === "issued");
  return (
    <>
      <h1>Billing</h1>
      {sp.e && <div className="notice error">{sp.e}</div>}
      {sp.ok && <div className="notice ok">{sp.ok}</div>}
      {!e.subscribed ? <div className="notice" data-testid="no-plan">No package is set up for your company yet. The platform team will assign one; you can already fill your billing details below.</div> : (
        <div className="grid2">
          <section className="card" data-testid="current-plan">
            <div className="small muted">Your package</div>
            <h2 style={{ margin: "2px 0" }}>{e.plan!.name}</h2>
            <div>{inr(e.plan!.monthly_fee)} / month{e.discount_pct ? ` · ${e.discount_pct}% discount` : ""} <span className="muted small">+ GST</span></div>
            <ul className="small" style={{ margin: "8px 0 0" }}>{e.plan!.features.map((f) => <li key={f}>{f}</li>)}</ul>
          </section>
          <section className="card" data-testid="this-month">
            <div className="small muted">This month so far</div>
            <Meter label="People taking part" used={e.usage!.active_people} included={e.plan!.included_people} />
            <Meter label="AI runs" used={e.usage!.ai_runs} included={e.plan!.included_ai_runs} />
            <div className="row" style={{ justifyContent: "space-between", marginTop: 8 }}><span>Estimated bill if the month ended today</span><strong>{inr(e.estimate!.total)}</strong></div>
            <div className="small muted">incl. GST · {e.usage!.documents_approved} documents approved this month</div>
          </section>
        </div>)}

      <h2>Invoices</h2>
      {open.length > 0 && <div className="notice" data-testid="due">{open.length} invoice{open.length === 1 ? "" : "s"} to pay: {inr(open.reduce((t, i) => t + Number(i.total), 0))}</div>}
      {(invoices ?? []).length === 0 ? <p className="muted">No invoices yet.</p> : (
        <div className="table-wrap card" style={{ padding: 0 }}>
          <table data-testid="company-invoices">
            <thead><tr><th>Invoice</th><th>Month</th><th className="num">Total</th><th>Status</th><th>Due</th><th /></tr></thead>
            <tbody>{(invoices ?? []).map((i) => (
              <tr key={i.id}>
                <td><Link className="mono" href={`/c/${companyId}/billing/${i.id}`}>{i.number}</Link></td>
                <td>{new Date(i.period_start).toLocaleDateString("en-IN", { month: "long", year: "numeric" })}</td>
                <td className="num">{inr(i.total)}</td>
                <td><span className={`badge ${i.status === "paid" ? "ok" : i.status === "issued" ? "warn" : ""}`}>{i.status === "issued" ? "To pay" : i.status === "paid" ? "Paid" : "Void"}</span>
                  {i.disputed && <> <span className="badge danger">disputed</span></>}</td>
                <td className="small">{i.due_on ?? "—"}</td>
                <td><Link href={`/c/${companyId}/billing/${i.id}`}>View / download</Link></td>
              </tr>))}
            </tbody>
          </table>
        </div>)}

      <h2 id="details">Billing details</h2>
      <form action={saveProfile.bind(null, companyId)} className="card" data-testid="billing-profile">
        <p className="small muted" style={{ marginTop: 0 }}>Printed on your invoices as the customer. Your state decides whether CGST + SGST or IGST applies.</p>
        <div className="grid2">
          <div><label htmlFor="ln">Legal name</label><input id="ln" name="legal_name" defaultValue={profile?.legal_name ?? ""} /></div>
          <div><label htmlFor="gst">GSTIN (if registered)</label><input id="gst" name="gstin" defaultValue={profile?.gstin ?? ""} /></div>
          <div><label htmlFor="sc">State code</label><input id="sc" name="state_code" defaultValue={profile?.state_code ?? ""} placeholder="e.g. 27" /></div>
          <div><label htmlFor="em">Billing email</label><input id="em" name="email" type="email" defaultValue={profile?.billing_email ?? ""} /></div>
        </div>
        <label htmlFor="ad">Address</label><textarea id="ad" name="address" rows={2} defaultValue={profile?.address ?? ""} />
        <button type="submit" style={{ marginTop: 10 }}>Save billing details</button>
      </form>
    </>
  );
}
