// node --experimental-strip-types --test web/lib/mis.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { COMPANY_MIS, csvName, PLATFORM_MIS, toCsv } from "./mis.ts";

test("CSV: BOM, quoting, formula injection neutralised, numbers untouched", () => {
  const csv = toCsv({ title: "T", columns: ["A", "B", "C"], rows: [["=HYPERLINK(\"x\")", -5, 'say "hi", ok'], [null, "+1", "line\nbreak"]], from: "2026-11-01", to: "2026-11-20" });
  assert.ok(csv.startsWith("﻿A,B,C\r\n"));
  assert.match(csv, /"'=HYPERLINK\(""x""\)",-5,"say ""hi"", ok"/);
  assert.match(csv, /\r\n,'\+1,"line\nbreak"\r\n$/);
});

test("catalogue codes are unique and file names are safe", () => {
  const codes = [...COMPANY_MIS, ...PLATFORM_MIS].map((m) => m.code);
  assert.equal(new Set(codes).size, codes.length);
  assert.equal(COMPANY_MIS.length, 14); assert.equal(PLATFORM_MIS.length, 5);
  assert.equal(csvName("Tasks & tickets — service levels", "2026-11-01", "2026-11-20"), "tasks-tickets-service-levels_2026-11-01_2026-11-20.csv");
});
