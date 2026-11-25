import type { Json } from "@/lib/database.types";
import { PrintButton } from "./print-button";

export type Invoice = { id: string; number: string | null; status: string; disputed: boolean; proforma: boolean; period_start: string; period_end: string;
  lines: Json; subtotal: number; discount: number; taxable: number; cgst: number; sgst: number; igst: number; total: number; supplier: Json; recipient: Json;
  usage: Json; issued_at: string | null; due_on: string | null; paid_at: string | null; void_reason: string | null };

export const inr = (n: number | string) => "₹" + Number(n).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const d = (s: string | null) => s ? new Date(s).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—";
type Party = { legal_name?: string; gstin?: string; address?: string; state_code?: string; sac?: string; email?: string };
type Line = { label: string; qty: number; rate: number; amount: number };

/** Printable invoice (A4): the cost, simply (owner 25-Nov-2026). Tax and registration details appear only when they exist. */
export function InvoiceView({ inv }: { inv: Invoice }) {
  const s = (inv.supplier ?? {}) as Party; const r = (inv.recipient ?? {}) as Party; const u = (inv.usage ?? {}) as Record<string, number>;
  const lines = (inv.lines ?? []) as Line[];
  const title = inv.status === "draft" ? "Draft invoice" : s.gstin && Number(inv.cgst) + Number(inv.sgst) + Number(inv.igst) > 0 ? "Tax invoice" : "Invoice";
  const taxed = Number(inv.cgst) + Number(inv.sgst) + Number(inv.igst) > 0;
  return (
    <article className="invoice" data-testid="invoice">
      <div className="row no-print" style={{ justifyContent: "flex-end" }}><PrintButton /></div>
      <header className="row" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
        <div><h1 style={{ margin: 0 }}>{title}</h1>
          <div className="mono">{inv.number ?? "Number assigned when issued"}</div>
          {inv.status === "void" && <div className="badge danger">VOID — {inv.void_reason}</div>}
          {inv.status === "paid" && <div className="badge ok">PAID {d(inv.paid_at)}</div>}
          {inv.disputed && <div className="badge warn">Under dispute</div>}</div>
        <dl className="kv small" style={{ minWidth: 240 }}>
          <div><dt>Invoice date</dt><dd>{d(inv.issued_at)}</dd></div>
          <div><dt>Period</dt><dd>{d(inv.period_start)} – {d(inv.period_end)}</dd></div>
          <div><dt>Due</dt><dd>{d(inv.due_on)}</dd></div>
        </dl>
      </header>
      <div className="grid2" style={{ marginTop: 16 }}>
        <div><div className="small muted">From</div><strong>{s.legal_name || "Process & Policy Intelligence"}</strong>
          {s.address && <div className="small">{s.address}</div>}{s.gstin && <div className="small">GSTIN: {s.gstin}</div>}</div>
        <div><div className="small muted">Bill to</div><strong>{r.legal_name}</strong>{r.address && <div className="small">{r.address}</div>}
          {r.gstin && <div className="small">GSTIN: {r.gstin}</div>}</div>
      </div>
      <div className="table-wrap" style={{ marginTop: 16 }}>
        <table>
          <thead><tr><th>Description</th><th className="num">Qty</th><th className="num">Rate</th><th className="num">Amount</th></tr></thead>
          <tbody>
            {lines.map((l, k) => <tr key={k}><td style={{ whiteSpace: "normal" }}>{l.label}</td><td className="num">{l.qty}</td><td className="num">{inr(l.rate)}</td><td className="num">{inr(l.amount)}</td></tr>)}
            <tr><td colSpan={3} className="num">Subtotal</td><td className="num">{inr(inv.subtotal)}</td></tr>
            {Number(inv.discount) > 0 && <tr><td colSpan={3} className="num">Discount</td><td className="num">− {inr(inv.discount)}</td></tr>}
            {taxed && (Number(inv.igst) > 0 ? <tr><td colSpan={3} className="num">IGST</td><td className="num">{inr(inv.igst)}</td></tr>
              : <><tr><td colSpan={3} className="num">CGST</td><td className="num">{inr(inv.cgst)}</td></tr><tr><td colSpan={3} className="num">SGST</td><td className="num">{inr(inv.sgst)}</td></tr></>)}
            <tr><td colSpan={3} className="num"><strong>Total</strong></td><td className="num"><strong>{inr(inv.total)}</strong></td></tr>
          </tbody>
        </table>
      </div>
      <p className="small muted">Usage measured for the period: {u.active_people ?? 0} people took part · {u.ai_runs ?? 0} AI runs · {u.documents_approved ?? 0} documents approved.
        “People who took part” = members who answered, raised or worked a task, or replied to a request during the period.</p>
    </article>
  );
}
