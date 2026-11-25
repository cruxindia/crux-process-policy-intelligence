// Reads Office files (xlsx, docx, pptx) and zip archives without a server: pure functions over bytes, so the same code runs
// in the browser (bulk intake, D-105) and in Node tests. XML is read with small regular expressions — no DOM needed.
import { unzipSync, strFromU8 } from "fflate";

export type Zip = Record<string, Uint8Array>;
export const MAX_UNZIPPED = 200 * 1024 * 1024;   // refuse archives that would expand beyond 200 MB (zip bombs)

export function unzip(bytes: Uint8Array): Zip {
  let total = 0;
  return unzipSync(bytes, { filter: (f) => { total += f.originalSize; if (total > MAX_UNZIPPED) throw new Error("archive too large when expanded"); return true; } });
}

const ENT: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
export const decodeXml = (s: string) => s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, e: string) =>
  e[0] === "#" ? String.fromCodePoint(e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)) : ENT[e.toLowerCase()] ?? _);
const text = (z: Zip, p: string) => (z[p] ? strFromU8(z[p]) : "");
/** All <t> runs of a fragment joined (shared strings, inline strings, rich text). */
const runs = (frag: string) => [...frag.matchAll(/<(?:\w+:)?t(?:\s[^>]*)?>([\s\S]*?)<\/(?:\w+:)?t>/g)].map((m) => decodeXml(m[1]!)).join("");

// ---------------- xlsx ----------------
export type Sheet = { name: string; rows: string[][] };   // rows[r][c] (0-based), "" for empty

const colIndex = (ref: string) => { let n = 0; for (const ch of ref.replace(/\d+/g, "")) n = n * 26 + (ch.charCodeAt(0) - 64); return n - 1; };

export function readXlsx(z: Zip): Sheet[] {
  const shared = [...text(z, "xl/sharedStrings.xml").matchAll(/<(?:\w+:)?si>([\s\S]*?)<\/(?:\w+:)?si>/g)].map((m) => runs(m[1]!));
  const rels = new Map([...text(z, "xl/_rels/workbook.xml.rels").matchAll(/<Relationship\b[^>]*>/g)].map((m) => {
    const id = /Id="([^"]+)"/.exec(m[0])?.[1] ?? ""; const target = /Target="([^"]+)"/.exec(m[0])?.[1] ?? "";
    return [id, target.startsWith("/") ? target.slice(1) : `xl/${target.replace(/^\.\//, "")}`] as [string, string];
  }));
  const sheets: Sheet[] = [];
  for (const m of text(z, "xl/workbook.xml").matchAll(/<(?:\w+:)?sheet\b[^>]*\/?>/g)) {
    const name = decodeXml(/name="([^"]*)"/.exec(m[0])?.[1] ?? "");
    const rid = /r:id="([^"]+)"/.exec(m[0])?.[1] ?? /\bid="([^"]+)"/.exec(m[0])?.[1] ?? "";
    const xml = text(z, rels.get(rid) ?? "");
    const rows: string[][] = [];
    for (const rm of xml.matchAll(/<(?:\w+:)?row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:\w+:)?row>)/g)) {
      const r = Number(/\br="(\d+)"/.exec(rm[1]!)?.[1] ?? rows.length + 1) - 1;
      const row: string[] = [];
      for (const cm of (rm[2] ?? "").matchAll(/<(?:\w+:)?c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:\w+:)?c>)/g)) {
        const attrs = cm[1]!; const body = cm[2] ?? "";
        const ref = /\br="([A-Z]+)\d+"/.exec(attrs)?.[1]; const c = ref ? colIndex(ref) : row.length;
        const t = /\bt="(\w+)"/.exec(attrs)?.[1]; const v = /<(?:\w+:)?v>([\s\S]*?)<\/(?:\w+:)?v>/.exec(body)?.[1];
        let val = "";
        if (t === "s") val = shared[Number(v)] ?? "";
        else if (t === "inlineStr") val = runs(body);
        else if (t === "b") val = v === "1" ? "TRUE" : "FALSE";
        else if (v !== undefined) val = decodeXml(v);
        while (row.length < c) row.push("");
        row[c] = val.trim();
      }
      while (rows.length < r) rows.push([]);
      rows[r] = row;
    }
    sheets.push({ name, rows });
  }
  return sheets;
}

// ---------------- docx / pptx ----------------
/** Word text: paragraphs on their own lines; table cells separated by " | ", rows on their own lines; headings keep a "# " mark. */
export function readDocx(z: Zip): string {
  const xml = text(z, "word/document.xml");
  const body = xml.replace(/<w:tab\/>/g, "\t").replace(/<w:br\/>/g, "\n");
  const out: string[] = [];
  for (const m of body.matchAll(/<w:tbl>[\s\S]*?<\/w:tbl>|<w:p\b[\s\S]*?<\/w:p>/g)) {
    const block = m[0];
    if (block.startsWith("<w:tbl>")) {
      for (const tr of block.matchAll(/<w:tr\b[\s\S]*?<\/w:tr>/g))
        out.push([...tr[0].matchAll(/<w:tc\b[\s\S]*?<\/w:tc>/g)].map((tc) => runs(tc[0]).replace(/\s+/g, " ").trim()).join(" | "));
      continue;
    }
    const style = /<w:pStyle w:val="([^"]+)"/.exec(block)?.[1] ?? "";
    const level = /^Heading(\d)$/i.exec(style)?.[1] ?? (/^Title$/i.test(style) ? "1" : "");
    const list = /<w:numPr\b/.test(block);
    const t = runs(block).trim();
    if (t) out.push(level ? `${"#".repeat(Number(level))} ${t}` : list ? `- ${t}` : t);
  }
  return out.join("\n");
}

export function readPptx(z: Zip): string {
  const slides = Object.keys(z).filter((p) => /^ppt\/slides\/slide\d+\.xml$/.test(p))
    .sort((a, b) => Number(/(\d+)\.xml$/.exec(a)![1]) - Number(/(\d+)\.xml$/.exec(b)![1]));
  return slides.map((p, i) => `# Slide ${i + 1}\n` + [...text(z, p).matchAll(/<a:p\b[\s\S]*?<\/a:p>/g)].map((m) => runs(m[0]).trim()).filter(Boolean).join("\n")).join("\n\n");
}

/** Sheets as plain text (for documents that are registers/forms kept in Excel). */
export function xlsxText(sheets: Sheet[], maxRows = 400) {
  return sheets.map((s) => `# ${s.name}\n` + s.rows.slice(0, maxRows).filter((r) => r.some(Boolean)).map((r) => r.join(" | ")).join("\n")).join("\n\n");
}
