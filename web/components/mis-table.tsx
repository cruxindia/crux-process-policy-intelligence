import Link from "next/link";
import type { MisResult } from "@/lib/mis";

const fmt = (v: unknown) => (v === null || v === undefined || v === "" ? "—" : typeof v === "number" ? v.toLocaleString("en-IN") : String(v));

/** One MIS report: period picker (GET), table, CSV download. */
export function MisTable({ r, csvHref, back, why }: { r: MisResult; csvHref: string; back: string; why?: string }) {
  return (
    <>
      <p><Link href={back}>← All reports</Link></p>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-end" }}>
        <div><h1 style={{ marginBottom: 4 }}>{r.title}</h1>{why && <p className="muted" style={{ margin: 0 }}>{why}</p>}</div>
        <a className="button" href={csvHref} data-testid="csv" download>Download CSV (Excel)</a>
      </div>
      <form className="row" method="get" style={{ alignItems: "flex-end", margin: "12px 0" }} data-testid="period">
        <div><label htmlFor="from">From</label><input id="from" name="from" type="date" defaultValue={r.from} /></div>
        <div><label htmlFor="to">To</label><input id="to" name="to" type="date" defaultValue={r.to} /></div>
        <button type="submit" className="secondary">Show</button>
        {r.scope === "departments" && <span className="badge">Your departments only</span>}
      </form>
      {r.rows.length === 0 ? <p className="muted" data-testid="mis-empty">Nothing to show for this period yet.</p> : (
        <div className="table-wrap card" style={{ padding: 0 }}>
          <table data-testid="mis-table">
            <thead><tr>{r.columns.map((c) => <th key={c}>{c}</th>)}</tr></thead>
            <tbody>{r.rows.map((row, i) => <tr key={i}>{row.map((v, j) => <td key={j} className={typeof v === "number" ? "num" : undefined} style={{ whiteSpace: "normal" }}>{fmt(v)}</td>)}</tr>)}</tbody>
          </table>
        </div>)}
      <p className="small muted">{r.rows.length} row{r.rows.length === 1 ? "" : "s"} · period {r.from} to {r.to}. Figures only — interview answers and document text are never part of a report.</p>
    </>
  );
}
