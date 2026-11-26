"use client";
// Reads one file on this computer (D-105): fingerprint + text. Only the caller decides what may leave the computer.
import { unzip, readDocx, readPptx, readXlsx, xlsxText, type Zip } from "./office-text";

export type Extracted = { sha256: string; text: string | null; pages: number | null; unreadable: string | null };
export type Entry = { name: string; folder: string; size: number; modified: number | null; bytes: () => Promise<ArrayBuffer>;
  /** Optional fingerprint (64 hex) used instead of downloading, when the file is only counted (Google Drive). */ fingerprint?: () => Promise<string> };

export const sha256Hex = async (b: ArrayBuffer) => [...new Uint8Array(await crypto.subtle.digest("SHA-256", b))].map((x) => x.toString(16).padStart(2, "0")).join("");
export const extOf = (n: string) => (/\.([a-z0-9]{1,8})$/i.exec(n)?.[1] ?? "").toLowerCase();
export const MAX_FILE = 60 * 1024 * 1024;

async function pdfText(buf: ArrayBuffer): Promise<{ text: string; pages: number }> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
  const task = pdfjs.getDocument({ data: new Uint8Array(buf) }); const doc = await task.promise;
  const out: string[] = [];
  for (let i = 1; i <= Math.min(doc.numPages, 300); i++) {
    const page = await doc.getPage(i);
    const c = await page.getTextContent();
    out.push(c.items.map((it) => ("str" in it ? it.str + (it.hasEOL ? "\n" : " ") : "")).join(""));
  }
  const pages = doc.numPages; await task.destroy();
  return { text: out.join("\n\n").replace(/[ \t]+\n/g, "\n").trim(), pages };
}

/** Text of one file; wantText=false only fingerprints it (records never need their text read). */
export async function extract(buf: ArrayBuffer, name: string, wantText: boolean): Promise<Extracted> {
  const sha256 = await sha256Hex(buf);
  if (!wantText) return { sha256, text: null, pages: null, unreadable: null };
  const ext = extOf(name);
  try {
    if (ext === "docx" || ext === "docm") return { sha256, text: readDocx(unzip(new Uint8Array(buf))), pages: null, unreadable: null };
    if (ext === "pptx") return { sha256, text: readPptx(unzip(new Uint8Array(buf))), pages: null, unreadable: null };
    if (ext === "xlsx" || ext === "xlsm") return { sha256, text: xlsxText(readXlsx(unzip(new Uint8Array(buf)))), pages: null, unreadable: null };
    if (ext === "pdf") {
      const r = await pdfText(buf);
      return r.text.length < 20 ? { sha256, text: null, pages: r.pages, unreadable: "Scanned PDF without text (needs OCR)" } : { sha256, text: r.text, pages: r.pages, unreadable: null };
    }
    if (["txt", "md", "csv"].includes(ext)) return { sha256, text: new TextDecoder().decode(buf), pages: null, unreadable: null };
    if (["doc", "xls", "ppt", "rtf"].includes(ext)) return { sha256, text: null, pages: null, unreadable: `Old .${ext} format — save it as .${ext}x and add it again` };
    return { sha256, text: null, pages: null, unreadable: `.${ext || "?"} files cannot be read` };
  } catch (e) {
    return { sha256, text: null, pages: null, unreadable: `Could not read the file (${String((e as Error).message ?? e).slice(0, 80)})` };
  }
}

/** Files inside a .zip become entries of their own (folder = archive name + inner path). Nested zips are not opened. */
export function zipEntries(z: Zip, zipName: string): Entry[] {
  return Object.entries(z).filter(([p, b]) => !p.endsWith("/") && b.length > 0 && !/(^|\/)(__MACOSX|\.DS_Store|Thumbs\.db)/.test(p)).map(([p, b]) => {
    const i = p.lastIndexOf("/");
    return { name: p.slice(i + 1), folder: `${zipName}${i > 0 ? "/" + p.slice(0, i) : ""}`, size: b.length, modified: null,
      bytes: async () => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer };
  });
}
export { unzip };
