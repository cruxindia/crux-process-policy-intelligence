"use client";
// Bulk intake (D-105/D-106): thousands of files, read on this computer, 50 at a time.
// 1 fingerprint every file (SHA-256) and skip what is already in; 2 classify by name (and, for unclear names, by the text,
// which stays on this computer); 3 register the files; 4 send text for governing documents only.
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { classify, mayShareText, type Classification } from "@/lib/doc-classify";
import { extract, extOf, MAX_FILE, unzip, zipEntries, type Entry } from "@/lib/extract";
import { connectDrive, folderIdFromLink, listDriveFolder } from "@/lib/drive";
import { zipEntriesLazy } from "@/lib/zip-lazy";

type Stats = { total: number; done: number; added: number; duplicate: number; governing: number; record: number; sensitive: number; unreadable: number; problems: string[] };
const zero = (): Stats => ({ total: 0, done: 0, added: 0, duplicate: 0, governing: 0, record: 0, sensitive: 0, unreadable: 0, problems: [] });
const READABLE = new Set(["docx", "docm", "pdf", "xlsx", "xlsm", "pptx", "txt", "md", "csv"]);
const SKIP = /(^|\/)(\.|~\$|desktop\.ini$|thumbs\.db$)|\.(psd1|psm1|exe|dll|lnk|tmp|ini)$/i;

type FileEntry = Entry & { blob?: Blob };
const fromFile = (f: File): FileEntry => {
  const rel = (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name;
  const i = rel.lastIndexOf("/");
  return { name: f.name, folder: i > 0 ? rel.slice(0, i) : "", size: f.size, modified: f.lastModified || null, bytes: () => f.arrayBuffer(), blob: f };
};

export function Uploader({ companyId, driveClientId }: { companyId: string; driveClientId?: string }) {
  const router = useRouter();
  const [st, setSt] = useState<Stats | null>(null); const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null);
  const stop = useRef(false);
  const folderRef = useRef<HTMLInputElement>(null); const filesRef = useRef<HTMLInputElement>(null);
  const [drive, setDrive] = useState(false); const [link, setLink] = useState(""); const [driveNote, setDriveNote] = useState<string | null>(null);

  async function run(input: Entry[], label: string, pre: string[] = []) {
    const db = createClient(); const s = zero(); stop.current = false; s.problems.push(...pre);
    const bump = () => setSt({ ...s, problems: [...s.problems] });
    // Expand .zip archives into their files first (their contents count, not the archive).
    let entries: Entry[] = [];
    for (const e of input) {
      if (SKIP.test(`${e.folder}/${e.name}`)) continue;
      if (extOf(e.name) === "zip") {
        // Read the archive entry by entry from disk: Drive folder downloads are often several GB (and split into parts).
        try {
          const blob = (e as FileEntry).blob ?? new Blob([await e.bytes()]);
          const inner = (await zipEntriesLazy(blob, `${e.folder ? e.folder + "/" : ""}${e.name}`)).filter((x) => !SKIP.test(`${x.folder}/${x.name}`));
          if (!inner.length) s.problems.push(`${e.name}: the archive is empty`);
          entries.push(...inner);
        } catch (x) { s.problems.push(`${e.name}: could not open the archive (${(x as Error).message})`); }
      } else entries.push(e);
    }
    s.total = entries.length; bump();
    const { data: batch, error: be } = await db.rpc("intake_begin", { p_company: companyId, p_label: label });
    if (be) throw be;

    for (let i = 0; i < entries.length && !stop.current; i += 50) {
      const chunk = entries.slice(i, i + 50);
      const prepared: { e: Entry; c: Classification; sha256: string; text: string | null; pages: number | null; unreadable: string | null }[] = [];
      for (const e of chunk) {
        if (e.size > MAX_FILE) { s.problems.push(`${e.folder ? e.folder + "/" : ""}${e.name}: larger than 60 MB, skipped`); s.done++; continue; }
        try {
          let c = classify(e.name, e.folder);
          // Read text for rule documents, and for unclear names (to see whether they are written like a policy). Records with clear names are only fingerprinted.
          // Rule documents always go through extract(), so an old .doc/.xls or an image is reported as "could not be read" instead of silently skipped.
          const read = c.category === "governing" || (READABLE.has(extOf(e.name)) && c.category === "record" && c.docType === "other");
          // Files that are only counted and carry their own fingerprint (Google Drive) are not downloaded at all.
          const x = !read && e.fingerprint ? { sha256: await e.fingerprint(), text: null, pages: null, unreadable: null } : await extract(await e.bytes(), e.name, read);
          if (x.text && c.category === "record") c = classify(e.name, e.folder, x.text.slice(0, 12000));
          prepared.push({ e, c, sha256: x.sha256, text: mayShareText(c) ? x.text : null, pages: x.pages, unreadable: mayShareText(c) ? x.unreadable : null });
        } catch (x) { s.problems.push(`${e.name}: ${(x as Error).message}`); s.done++; }
      }
      if (!prepared.length) { bump(); continue; }
      const { data: res, error } = await db.rpc("intake_add", { p_company: companyId, p_batch: batch as string, p_docs: prepared.map((p) => ({
        sha256: p.sha256, file_name: p.e.name, folder: p.e.folder, ext: extOf(p.e.name), size_bytes: p.e.size,
        file_modified_at: p.e.modified ? new Date(p.e.modified).toISOString() : null, category: p.c.category, doc_type: p.c.docType,
        department_code: p.c.department, reason: p.c.reason, pages: p.pages, read_status: p.unreadable ? "unreadable" : null, unreadable_reason: p.unreadable })) });
      if (error) throw error;
      // intake_add answers one row per file, in order (a file and its exact copy in the same group get "added" then "duplicate").
      const out = res as { sha256: string; id: string; status: string; category: string }[];
      for (const [k, p] of prepared.entries()) {
        const r = out[k]?.sha256 === p.sha256 ? out[k] : undefined; s.done++;
        if (!r) continue;
        if (r.status === "duplicate") { s.duplicate++; continue; }
        s.added++; s[r.category as "governing" | "record" | "sensitive"]++;
        if (p.unreadable) { s.unreadable++; s.problems.push(`${p.e.name}: ${p.unreadable}`); }
        else if (r.category === "governing" && p.text) {
          const { error: te } = await db.rpc("intake_put_text", { p_company: companyId, p_document: r.id, p_body: p.text.slice(0, 400000) });
          if (te) s.problems.push(`${p.e.name}: ${te.message.replace(/^PPI_\w+: /, "")}`);
        }
      }
      bump();
    }
    bump(); router.refresh();
  }

  const go = async (list: FileList | null) => {
    if (!list?.length) return;
    const files = [...list]; const first = (files[0] as File & { webkitRelativePath?: string }).webkitRelativePath?.split("/")[0];
    const label = first || `${files.length} file${files.length === 1 ? "" : "s"} on ${new Date().toLocaleDateString("en-IN")}`;
    setBusy(true); setErr(null);
    try { await run(files.map(fromFile), label); } catch (x) { setErr(String((x as { message?: string }).message ?? x).replace(/^PPI_\w+: /, "")); }
    setBusy(false);
    if (folderRef.current) folderRef.current.value = ""; if (filesRef.current) filesRef.current.value = "";
  };

  return (
    <div className="card" data-testid="uploader">
      <h2 style={{ marginTop: 0 }}>Bring your existing documents</h2>
      <p className="small muted" style={{ maxWidth: 760 }}>Choose a whole folder (for example your Google Drive folder synced to this computer, or a downloaded Drive zip) or individual files.
        Files are read on this computer. Only the text of rule documents — policies, SOPs, job descriptions, KRAs, forms — is sent for analysis.
        Letters, minutes and other records are only counted, and personal or legal records (pay, warnings, IDs, police, court) are never read. Your originals stay where they are.</p>
      <div className="row" style={{ gap: 10 }}>
        <label className="button" style={{ cursor: busy ? "default" : "pointer" }}>Choose a folder
          <input ref={folderRef} type="file" hidden disabled={busy} data-testid="pick-folder" onChange={(e) => go(e.target.files)}
            {...({ webkitdirectory: "", directory: "" } as Record<string, string>)} multiple /></label>
        <label className="button secondary" style={{ cursor: busy ? "default" : "pointer" }}>Choose files or a .zip
          <input ref={filesRef} type="file" hidden disabled={busy} multiple data-testid="pick-files" onChange={(e) => go(e.target.files)} /></label>
        <button type="button" className="secondary" disabled={busy} onClick={() => setDrive((d) => !d)} data-testid="pick-drive">Import from Google Drive</button>
        {busy && <button type="button" className="secondary" onClick={() => { stop.current = true; }}>Stop after this group</button>}
      </div>
      {drive && (
        <div className="card" style={{ marginTop: 10 }} data-testid="drive-import">
          {driveClientId ? <>
            <label htmlFor="drive-link" className="small">Google Drive folder link (the folder and all its sub-folders are imported)</label>
            <div className="row" style={{ gap: 8 }}>
              <input id="drive-link" value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://drive.google.com/drive/folders/…" style={{ flex: 1, minWidth: 220 }} />
              <button type="button" disabled={busy || !folderIdFromLink(link)} onClick={async () => {
                const id = folderIdFromLink(link); if (!id) return;
                setBusy(true); setErr(null); setDriveNote("Connecting to Google…");
                try {
                  const token = await connectDrive(driveClientId);
                  setDriveNote("Listing the folder and its sub-folders…");
                  const { root, entries, skipped } = await listDriveFolder(token, id, (n, f) => setDriveNote(`Listing… ${n} files in ${f} folders`));
                  setDriveNote(`${entries.length} files found in “${root}”. Only rule documents are downloaded; the rest are counted by Drive's fingerprint.`);
                  await run(entries, `Google Drive: ${root}`, skipped);
                } catch (x) { setErr((x as Error).message); }
                setBusy(false);
              }}>Connect and import</button>
            </div>
            <p className="small muted" style={{ marginBottom: 0 }}>Google asks you to allow read-only access. The files go from Google to this browser; the access ends when you close this page.</p>
            {driveNote && <p className="small" data-testid="drive-note">{driveNote}</p>}
          </> : (
            <p className="small" style={{ margin: 0 }} data-testid="drive-setup">Direct Google Drive import needs a one-time Google setting by the platform owner (a Google sign-in ID for this site).
              Until then: in Google Drive, right-click the folder → <strong>Download</strong> (Google makes a .zip), then use <strong>Choose files or a .zip</strong> — sub-folders and Google Docs/Sheets come in the same way.</p>)}
        </div>)}
      {err && <p className="notice error">{err}</p>}
      {st && (
        <div style={{ marginTop: 12 }} data-testid="intake-progress">
          <div className="progress" aria-label="progress"><span style={{ width: `${st.total ? Math.round((st.done / st.total) * 100) : 0}%` }} /></div>
          <p className="small" data-testid="intake-counts"><strong>{st.done} of {st.total}</strong> files · {st.added} new · {st.duplicate} already in ·
            {" "}{st.governing} rule documents · {st.record} records · {st.sensitive} personal/legal (not read) · {st.unreadable} could not be read</p>
          {!busy && st.done === st.total && <p className="notice ok">Done. Rule documents are now queued for analysis.</p>}
          {st.problems.length > 0 && <details><summary className="small">{st.problems.length} file{st.problems.length === 1 ? "" : "s"} need attention</summary>
            <ul className="small">{st.problems.slice(0, 200).map((p, i) => <li key={i}>{p}</li>)}</ul></details>}
        </div>)}
    </div>
  );
}
