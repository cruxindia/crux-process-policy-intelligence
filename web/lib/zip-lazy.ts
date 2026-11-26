// Reads a .zip file entry by entry, straight from disk (Blob.slice), so archives of any size work — e.g. a Google Drive
// folder download of several GB, split by Google into parts. Only the file being processed is held in memory.
// Supports ZIP64 (Drive uses it for large downloads), stored and deflated entries, UTF-8 and legacy names.
import { inflateSync } from "fflate";
import type { Entry } from "./extract";

const u16 = (v: DataView, o: number) => v.getUint16(o, true);
const u32 = (v: DataView, o: number) => v.getUint32(o, true);
const u64 = (v: DataView, o: number) => Number(v.getBigUint64(o, true));
const view = async (b: Blob, start: number, end: number) => new DataView(await b.slice(start, end).arrayBuffer());
const SKIP = /(^|\/)(__MACOSX|\.DS_Store|Thumbs\.db|desktop\.ini)(\/|$)/i;

export type ZipItem = { path: string; method: number; compSize: number; size: number; offset: number; modified: number | null };

function dosTime(date: number, time: number): number | null {
  if (!date) return null;
  const d = new Date(Date.UTC(1980 + (date >> 9), ((date >> 5) & 15) - 1, date & 31, time >> 11, (time >> 5) & 63, (time & 31) * 2));
  return Number.isNaN(d.getTime()) ? null : d.getTime();
}

/** The archive's table of contents (central directory). Throws a plain-language error for files that are not zips. */
export async function listZip(blob: Blob): Promise<ZipItem[]> {
  const tailLen = Math.min(blob.size, 65557);
  const tail = await view(blob, blob.size - tailLen, blob.size);
  let eocd = -1;
  for (let i = tailLen - 22; i >= 0; i--) if (u32(tail, i) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error("not a readable .zip (it may be incomplete — download it again)");
  let count = u16(tail, eocd + 10), cdSize = u32(tail, eocd + 12), cdOffset = u32(tail, eocd + 16);
  if (count === 0xffff || cdSize === 0xffffffff || cdOffset === 0xffffffff) {   // ZIP64: locator sits just before the EOCD
    const loc = eocd - 20;
    if (loc < 0 || u32(tail, loc) !== 0x07064b50) throw new Error("ZIP64 archive without its locator");
    const z64at = u64(tail, loc + 8);
    const z = await view(blob, z64at, z64at + 56);
    if (u32(z, 0) !== 0x06064b50) throw new Error("damaged ZIP64 archive");
    count = u64(z, 32); cdSize = u64(z, 40); cdOffset = u64(z, 48);
  }
  const cd = await view(blob, cdOffset, cdOffset + cdSize);
  const utf8 = new TextDecoder("utf-8", { fatal: true }); const latin = new TextDecoder("latin1");
  const items: ZipItem[] = []; let p = 0;
  for (let n = 0; n < count && p + 46 <= cd.byteLength; n++) {
    if (u32(cd, p) !== 0x02014b50) throw new Error("damaged archive table of contents");
    const flags = u16(cd, p + 8), method = u16(cd, p + 10), time = u16(cd, p + 12), date = u16(cd, p + 14);
    let compSize = u32(cd, p + 20), size = u32(cd, p + 24);
    const nameLen = u16(cd, p + 28), extraLen = u16(cd, p + 30), commentLen = u16(cd, p + 32);
    let offset = u32(cd, p + 42);
    const nameBytes = new Uint8Array(cd.buffer, cd.byteOffset + p + 46, nameLen);
    let path: string;
    try { path = utf8.decode(nameBytes); } catch { path = (flags & 0x800) ? new TextDecoder().decode(nameBytes) : latin.decode(nameBytes); }
    // ZIP64 extra field: the 0xFFFFFFFF values above are replaced, in this order.
    let e = p + 46 + nameLen; const eEnd = e + extraLen;
    while (e + 4 <= eEnd) {
      const id = u16(cd, e), len = u16(cd, e + 2); let q = e + 4;
      if (id === 0x0001) {
        if (size === 0xffffffff) { size = u64(cd, q); q += 8; }
        if (compSize === 0xffffffff) { compSize = u64(cd, q); q += 8; }
        if (offset === 0xffffffff) { offset = u64(cd, q); q += 8; }
      }
      e += 4 + len;
    }
    p += 46 + nameLen + extraLen + commentLen;
    path = path.replace(/\\/g, "/");
    if (path.endsWith("/") || SKIP.test(path)) continue;
    items.push({ path, method, compSize, size, offset, modified: dosTime(date, time) });
  }
  return items;
}

/** One entry's bytes, read and inflated on demand. */
export async function readZipItem(blob: Blob, it: ZipItem): Promise<ArrayBuffer> {
  const h = await view(blob, it.offset, it.offset + 30);
  if (u32(h, 0) !== 0x04034b50) throw new Error("damaged entry in the archive");
  const start = it.offset + 30 + u16(h, 26) + u16(h, 28);
  const raw = new Uint8Array(await blob.slice(start, start + it.compSize).arrayBuffer());
  if (it.method === 0) return raw.buffer as ArrayBuffer;
  if (it.method === 8) { const out = inflateSync(raw, { out: new Uint8Array(it.size) }); return out.buffer as ArrayBuffer; }
  throw new Error(`compression method ${it.method} is not supported — re-create the zip with standard settings`);
}

/** Intake entries for every file in the archive (folders inside the zip become the file's folder). */
export async function zipEntriesLazy(blob: Blob, zipPath: string): Promise<Entry[]> {
  return (await listZip(blob)).map((it) => {
    const i = it.path.lastIndexOf("/");
    return { name: it.path.slice(i + 1), folder: `${zipPath}${i > 0 ? "/" + it.path.slice(0, i) : ""}`, size: it.size, modified: it.modified,
      bytes: () => readZipItem(blob, it) };
  });
}
