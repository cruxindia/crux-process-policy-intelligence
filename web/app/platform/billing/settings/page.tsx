import { requirePlatformAdmin } from "@/lib/session";
import { saveSettings } from "../actions";

export default async function BillingSettings({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const { supabase } = await requirePlatformAdmin();
  const { data } = await supabase.rpc("platform_billing_settings");
  const c = (data ?? {}) as Record<string, string>;
  return (
    <>
      <h1>Billing profile</h1>
      <p className="muted">These details print on every invoice as the supplier. Until legal name, GSTIN, address and state are filled, invoices are issued as <strong>proforma</strong>. Check the SAC code and GST rate with your accountant — this page does not give tax advice.</p>
      {sp.e && <div className="notice error">{sp.e}</div>}
      {sp.ok && <div className="notice ok">{sp.ok}</div>}
      <form action={saveSettings} className="card" data-testid="billing-settings">
        <div className="grid2">
          <div><label htmlFor="bl">Legal name</label><input id="bl" name="billing_legal_name" defaultValue={c.billing_legal_name} /></div>
          <div><label htmlFor="bg">GSTIN</label><input id="bg" name="billing_gstin" defaultValue={c.billing_gstin} placeholder="15 characters, e.g. 27ABCDE1234F1Z5" /></div>
          <div><label htmlFor="bs">State code</label><input id="bs" name="billing_state_code" defaultValue={c.billing_state_code} placeholder="e.g. 27 (Maharashtra)" /></div>
          <div><label htmlFor="sac">SAC code</label><input id="sac" name="sac_code" defaultValue={c.sac_code} placeholder="ask your accountant" /></div>
          <div><label htmlFor="gr">GST rate (%)</label><input id="gr" name="gst_rate" defaultValue={c.gst_rate ?? "18"} /></div>
          <div><label htmlFor="ip">Invoice number prefix (max 5)</label><input id="ip" name="invoice_prefix" defaultValue={c.invoice_prefix ?? "PPI"} maxLength={5} /></div>
          <div><label htmlFor="pt">Payment terms (days)</label><input id="pt" name="payment_terms_days" type="number" min={0} defaultValue={c.payment_terms_days ?? "15"} /></div>
        </div>
        <label htmlFor="ba">Address</label><textarea id="ba" name="billing_address" rows={2} defaultValue={c.billing_address} />
        <label style={{ display: "flex", gap: 8, alignItems: "center", fontWeight: 400 }}>
          <input type="checkbox" name="auto_issue" defaultChecked={c.auto_issue === "true"} style={{ width: "auto" }} />
          Issue invoices automatically on the 1st of the month (otherwise they wait as drafts for your review)</label>
        <button type="submit" style={{ marginTop: 10 }}>Save</button>
      </form>
    </>
  );
}
