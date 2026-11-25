"use client";
// The workbook is read in this browser (no upload of the file itself); its rows go to the database in chunks of 200,
// then the server reconciles every sheet's row count before the baseline becomes active.
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { unzip, readXlsx } from "@/lib/office-text";
import { parseSheet, workbookFacts } from "@/lib/baseline-parse";

const sha256 = async (b: ArrayBuffer) => [...new Uint8Array(await crypto.subtle.digest("SHA-256", b))].map((x) => x.toString(16).padStart(2, "0")).join("");

export function ImportBaseline() {
  const router = useRouter();
  const [log, setLog] = useState<string[]>([]); const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ name: string; buf: ArrayBuffer; facts: ReturnType<typeof workbookFacts>; sheets: ReturnType<typeof parseSheet>[] } | null>(null);
  const say = (s: string) => setLog((l) => [...l, s]);
  return (
    <div className="card" data-testid="baseline-import">
      <h2 style={{ marginTop: 0 }}>Import a baseline workbook</h2>
      <p className="small muted">The workbook is read on this computer. Every row of every sheet is kept; the import only becomes active when every sheet&apos;s row count matches.</p>
      <input type="file" accept=".xlsx" data-testid="baseline-file" onChange={async (e) => {
        setErr(null); setLog([]); setPreview(null);
        const f = e.target.files?.[0]; if (!f) return;
        try {
          const buf = await f.arrayBuffer();
          const sheets = readXlsx(unzip(new Uint8Array(buf)));
          setPreview({ name: f.name, buf, facts: workbookFacts(sheets), sheets: sheets.map(parseSheet) });
        } catch (x) { setErr(`This file could not be read as an Excel workbook (${(x as Error).message}).`); }
      }} />
      {err && <p className="notice error">{err}</p>}
      {preview && (
        <form style={{ marginTop: 12 }} onSubmit={async (e) => {
          e.preventDefault(); const fd = new FormData(e.currentTarget); setBusy(true); setErr(null); setLog([]);
          const db = createClient();
          try {
            const meta = Object.fromEntries(preview.sheets.map((s) => [s.sheet, { rows: s.rows.length, header_row: s.header_row, columns: s.columns }]));
            const { data: id, error } = await db.rpc("baseline_begin", { p_code: String(fd.get("code")), p_version: String(fd.get("version")), p_title: String(fd.get("title")),
              p_as_of: preview.facts.asOf, p_source_name: preview.name, p_source_sha256: await sha256(preview.buf), p_sheet_meta: meta });
            if (error) throw error;
            for (const s of preview.sheets) {
              for (let i = 0; i < s.rows.length; i += 200) {
                const { error: e2 } = await db.rpc("baseline_add_rows", { p_version: id, p_sheet: s.sheet, p_rows: s.rows.slice(i, i + 200) });
                if (e2) throw e2;
              }
              say(`${s.sheet}: ${s.rows.length} rows`);
            }
            const { data: counts, error: e3 } = await db.rpc("baseline_finish", { p_version: id });
            if (e3) throw e3;
            say(`Activated. Links: ${JSON.stringify((counts as Record<string, unknown>)?._links ?? {})}`);
            router.refresh();
          } catch (x) { setErr(String((x as { message?: string }).message ?? x).replace(/^PPI_\w+: /, "")); }
          setBusy(false);
        }}>
          <div className="grid2">
            <div><label htmlFor="b-code">Code</label><input id="b-code" name="code" defaultValue="IN-PVT-AUDIT" required pattern="[A-Za-z0-9][A-Za-z0-9-]{1,39}" /></div>
            <div><label htmlFor="b-version">Version</label><input id="b-version" name="version" defaultValue={preview.facts.version ?? ""} required /></div>
          </div>
          <label htmlFor="b-title">Title</label><input id="b-title" name="title" defaultValue={preview.facts.title} required />
          <p className="small">{preview.sheets.length} sheets · {preview.sheets.reduce((n, s) => n + s.rows.length, 0)} rows · as of {preview.facts.asOf ?? "unknown"}</p>
          <details><summary className="small">Sheets</summary>
            <table className="small"><tbody>{preview.sheets.map((s) => <tr key={s.sheet}><td>{s.sheet}</td><td>{s.rows.length} rows</td><td>{s.columns.length} columns</td></tr>)}</tbody></table>
          </details>
          <button type="submit" disabled={busy} style={{ marginTop: 10 }}>{busy ? "Importing…" : "Import and activate"}</button>
        </form>)}
      {log.length > 0 && <ul className="small" data-testid="baseline-log">{log.map((l, i) => <li key={i}>{l}</li>)}</ul>}
    </div>
  );
}
