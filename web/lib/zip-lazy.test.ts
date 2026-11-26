// Lazy zip reader: ZIP64, deflate + stored, UTF-8 names, folders, junk skipped, entries read on demand.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { listZip, zipEntriesLazy } from "./zip-lazy.ts";

function makeZip(zip64: boolean) {
  const dir = mkdtempSync(join(tmpdir(), "zl-")); const out = join(dir, "t.zip");
  execFileSync("python3", ["-c", `
import zipfile,sys
with zipfile.ZipFile(sys.argv[1],'w') as z:
    for name,data,method in [('Policies/Leave Policy.docx',b'PK-like bytes '*50,zipfile.ZIP_DEFLATED),('Policies/कर्मचारी नीति.txt','नमस्ते policy'.encode(),zipfile.ZIP_DEFLATED),
                             ('Records/scan.pdf',b'%PDF-1.4 raw',zipfile.ZIP_STORED),('__MACOSX/._x',b'junk',zipfile.ZIP_STORED),('Empty/',b'',zipfile.ZIP_STORED)]:
        info=zipfile.ZipInfo(name); info.compress_type=method
        with z.open(info,'w',force_zip64=${zip64 ? "True" : "False"}) as f: f.write(data)
`, out]);
  return new Blob([readFileSync(out)]);
}

for (const zip64 of [false, true]) test(`reads ${zip64 ? "ZIP64" : "classic"} archives lazily`, async () => {
  const blob = makeZip(zip64);
  const items = await listZip(blob);
  assert.deepEqual(items.map((i) => i.path).sort(), ["Policies/Leave Policy.docx", "Policies/कर्मचारी नीति.txt", "Records/scan.pdf"]);
  const entries = await zipEntriesLazy(blob, "Drive export.zip");
  const leave = entries.find((e) => e.name === "Leave Policy.docx")!;
  assert.equal(leave.folder, "Drive export.zip/Policies");
  assert.equal(new TextDecoder().decode(await leave.bytes()), "PK-like bytes ".repeat(50));
  assert.equal(new TextDecoder().decode(await entries.find((e) => e.name === "scan.pdf")!.bytes()), "%PDF-1.4 raw");
  assert.equal(new TextDecoder().decode(await entries.find((e) => e.name.endsWith(".txt"))!.bytes()), "नमस्ते policy");
});

test("a file that is not a zip gives a plain message", async () => {
  await assert.rejects(listZip(new Blob([new Uint8Array(100)])), /not a readable \.zip/);
});
