import { requirePlatformAdmin } from "@/lib/session";
import { inr } from "@/components/invoice-view";
import { savePlan } from "../actions";

type Plan = { id: string; code: string; name: string; description: string | null; monthly_fee: number; included_people: number; price_per_extra_person: number;
  included_ai_runs: number; price_per_100_ai_runs: number; features: string[]; company_id: string | null; is_draft_price: boolean; status: string };

function PlanForm({ p, companies }: { p?: Plan; companies: { company_id: string; name: string }[] }) {
  const f = (k: string) => `${p?.id ?? "new"}-${k}`;
  return (
    <form action={savePlan} className="card" data-testid={p ? `plan-${p.code}` : "plan-new"}>
      <input type="hidden" name="id" value={p?.id ?? ""} />
      <div className="row" style={{ justifyContent: "space-between" }}>
        <strong>{p ? p.name : "New package"}</strong>
        {p?.is_draft_price && <span className="badge warn">draft price — save to confirm</span>}
        {p?.company_id && <span className="badge part">custom</span>}
      </div>
      <div className="grid2">
        <div><label htmlFor={f("name")}>Name</label><input id={f("name")} name="name" required defaultValue={p?.name} /></div>
        <div><label htmlFor={f("code")}>Code</label><input id={f("code")} name="code" required defaultValue={p?.code} /></div>
        <div><label htmlFor={f("fee")}>Monthly fee (₹, before GST)</label><input id={f("fee")} name="monthly_fee" type="number" min={0} step="0.01" required defaultValue={p?.monthly_fee} /></div>
        <div><label htmlFor={f("ip")}>People included</label><input id={f("ip")} name="included_people" type="number" min={0} required defaultValue={p?.included_people} /></div>
        <div><label htmlFor={f("pp")}>Price per extra person (₹)</label><input id={f("pp")} name="price_per_extra_person" type="number" min={0} step="0.01" required defaultValue={p?.price_per_extra_person} /></div>
        <div><label htmlFor={f("ia")}>AI runs included</label><input id={f("ia")} name="included_ai_runs" type="number" min={0} required defaultValue={p?.included_ai_runs} /></div>
        <div><label htmlFor={f("pa")}>Price per extra 100 AI runs (₹)</label><input id={f("pa")} name="price_per_100_ai_runs" type="number" min={0} step="0.01" required defaultValue={p?.price_per_100_ai_runs} /></div>
        <div><label htmlFor={f("co")}>Only for one company (custom package)</label>
          <select id={f("co")} name="company" defaultValue={p?.company_id ?? ""}><option value="">— offered to everyone —</option>
            {companies.map((c) => <option key={c.company_id} value={c.company_id}>{c.name}</option>)}</select></div>
        <div><label htmlFor={f("st")}>Status</label><select id={f("st")} name="status" defaultValue={p?.status ?? "active"}><option value="active">Offered</option><option value="retired">Retired</option></select></div>
      </div>
      <label htmlFor={f("desc")}>Short description</label><input id={f("desc")} name="description" defaultValue={p?.description ?? ""} />
      <label htmlFor={f("feat")}>What&rsquo;s included (one per line)</label><textarea id={f("feat")} name="features" rows={3} defaultValue={(p?.features ?? []).join("\n")} />
      <button type="submit" style={{ marginTop: 10 }}>{p ? "Save package" : "Create package"}</button>
    </form>
  );
}

export default async function Plans({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const { supabase } = await requirePlatformAdmin();
  const [{ data: plans }, { data: cos }] = await Promise.all([
    supabase.from("billing_plans").select("*").order("sort_order").order("name"), supabase.rpc("platform_companies")]);
  const companies = (cos ?? []).map((c) => ({ company_id: c.company_id, name: c.name }));
  return (
    <>
      <h1>Packages</h1>
      <p className="muted">Prices are yours to set. A company pays the monthly fee plus any people and AI usage beyond what the package includes; discounts are set per company on the Billing page. GST is added on the invoice.</p>
      {sp.e && <div className="notice error">{sp.e}</div>}
      {sp.ok && <div className="notice ok">{sp.ok}</div>}
      <div className="kpis">{(plans ?? []).filter((p) => p.status === "active").map((p) => (
        <div key={p.id} className="kpi"><div className="kpi-label">{p.name}{p.company_id ? " (custom)" : ""}</div><div className="kpi-value">{inr(p.monthly_fee)}</div>
          <div className="kpi-sub">{p.included_people} people · {p.included_ai_runs.toLocaleString("en-IN")} AI runs / month</div></div>))}</div>
      {(plans ?? []).map((p) => <PlanForm key={p.id} p={p as Plan} companies={companies} />)}
      <h2>Create a package (or a custom one for one company)</h2>
      <PlanForm companies={companies} />
    </>
  );
}
