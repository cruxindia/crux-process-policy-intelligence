// Google Drive import: link parsing, export names, recursive listing with paging, shortcuts and skipped Google-only formats.
import { test } from "node:test";
import assert from "node:assert/strict";
import { folderIdFromLink, intakeName, listDriveFolder, unsupportedGoogleType } from "./drive.ts";

test("folder id from the usual link shapes", () => {
  assert.equal(folderIdFromLink("https://drive.google.com/drive/folders/1Gcwg8JcRkEvocOYHgwU5Ficn3DZKI0dX?usp=sharing"), "1Gcwg8JcRkEvocOYHgwU5Ficn3DZKI0dX");
  assert.equal(folderIdFromLink("https://drive.google.com/open?id=1AbCdEfGhIjK"), "1AbCdEfGhIjK");
  assert.equal(folderIdFromLink("1AbCdEfGhIjKlmn"), "1AbCdEfGhIjKlmn");
  assert.equal(folderIdFromLink("not a link"), null);
});

test("Google formats get an Office extension; forms are not importable", () => {
  assert.equal(intakeName({ name: "Leave Policy", mimeType: "application/vnd.google-apps.document" }), "Leave Policy.docx");
  assert.equal(intakeName({ name: "MIS", mimeType: "application/vnd.google-apps.spreadsheet" }), "MIS.xlsx");
  assert.equal(intakeName({ name: "a.pdf", mimeType: "application/pdf" }), "a.pdf");
  assert.equal(unsupportedGoogleType("application/vnd.google-apps.form"), true);
  assert.equal(unsupportedGoogleType("application/vnd.google-apps.document"), false);
});

test("lists every sub-folder, follows pages and shortcuts, skips Google-only formats, fingerprints without downloading", async () => {
  const F = "application/vnd.google-apps.folder";
  const tree: Record<string, { name: string; pages: object[][] }> = {
    ROOT00000000: { name: "Company", pages: [[{ id: "HR0000000000", name: "HR", mimeType: F }, { id: "d1", name: "Leave Policy", mimeType: "application/vnd.google-apps.document" }],
      [{ id: "d2", name: "scan.pdf", mimeType: "application/pdf", size: "100", md5Checksum: "abc" }, { id: "s1", name: "link to HR", mimeType: "application/vnd.google-apps.shortcut", shortcutDetails: { targetId: "HR0000000000", targetMimeType: F } }]] },
    HR0000000000: { name: "HR", pages: [[{ id: "d3", name: "Feedback form", mimeType: "application/vnd.google-apps.form" }, { id: "d4", name: "KRA.docx", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", size: "10" }]] },
  };
  const calls: string[] = [];
  globalThis.fetch = (async (url: string) => {
    calls.push(url);
    const u = new URL(url);
    const meta = /\/files\/([A-Za-z0-9]+)$/.exec(u.pathname);
    if (meta && !u.searchParams.get("q")) return new Response(JSON.stringify({ id: meta[1], name: tree[meta[1]!]!.name, mimeType: F }));
    const parent = /'([^']+)' in parents/.exec(u.searchParams.get("q") ?? "")![1]!;
    const page = Number(u.searchParams.get("pageToken") ?? 0); const pages = tree[parent]!.pages;
    return new Response(JSON.stringify({ files: pages[page], ...(page + 1 < pages.length ? { nextPageToken: String(page + 1) } : {}) }));
  }) as typeof fetch;
  const r = await listDriveFolder("token", "ROOT00000000");
  assert.equal(r.root, "Company");
  assert.deepEqual(r.entries.map((e) => `${e.folder}/${e.name}`).sort(), ["Company/HR/KRA.docx", "Company/Leave Policy.docx", "Company/scan.pdf"]);
  assert.equal(r.skipped.length, 1); assert.match(r.skipped[0]!, /Feedback form/);
  assert.equal(calls.filter((c) => c.includes("HR0000000000") && c.includes("parents")).length, 1, "a folder reached twice (shortcut) is listed once");
  const scan = r.entries.find((e) => e.name === "scan.pdf")!;
  const fp = await scan.fingerprint!(); assert.match(fp, /^[0-9a-f]{64}$/);
  assert.equal(calls.some((c) => c.includes("alt=media")), false, "nothing downloaded while listing or fingerprinting");
});
