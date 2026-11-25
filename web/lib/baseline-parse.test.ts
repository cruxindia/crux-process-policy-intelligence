import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { unzip, readXlsx, readDocx } from "./office-text.ts";
import { parseSheet, workbookFacts } from "./baseline-parse.ts";
import { zipSync, strToU8 } from "fflate";

const WB = process.env.BASELINE_XLSX ?? "";

test("docx: headings, lists and tables become readable text", () => {
  const doc = `<w:document><w:body><w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Leave Policy</w:t></w:r></w:p>
    <w:p><w:pPr><w:numPr/></w:pPr><w:r><w:t xml:space="preserve">Apply </w:t></w:r><w:r><w:t>2 days ahead &amp; inform</w:t></w:r></w:p>
    <w:tbl><w:tr><w:tc><w:p><w:r><w:t>Role</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>Approver</w:t></w:r></w:p></w:tc></w:tr></w:tbl></w:body></w:document>`;
  const z = unzip(zipSync({ "word/document.xml": strToU8(doc) }));
  assert.equal(readDocx(z), "# Leave Policy\n- Apply 2 days ahead & inform\nRole | Approver");
});

test("xlsx: shared strings, inline strings, gaps and repeated headers", () => {
  const z = unzip(zipSync({
    "xl/workbook.xml": strToU8(`<workbook><sheets><sheet name="Reg &amp; Map" sheetId="1" r:id="rId1"/></sheets></workbook>`),
    "xl/_rels/workbook.xml.rels": strToU8(`<Relationships><Relationship Id="rId1" Type="x" Target="worksheets/sheet1.xml"/></Relationships>`),
    "xl/sharedStrings.xml": strToU8(`<sst><si><t>Document ID</t></si><si><r><t>Policy / Process</t></r><r><t> Document</t></r></si><si><t>Function / Department</t></si></sst>`),
    "xl/worksheets/sheet1.xml": strToU8(`<worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>TITLE</t></is></c></row>
      <row r="2"><c r="A2" t="s"><v>0</v></c><c r="B2" t="s"><v>1</v></c><c r="C2" t="s"><v>2</v></c></row>
      <row r="3"><c r="A3" t="inlineStr"><is><t>GOV-001</t></is></c><c r="C3" t="inlineStr"><is><t>Board</t></is></c></row>
      <row r="5"><c r="A5" t="s"><v>0</v></c><c r="B5" t="s"><v>1</v></c><c r="C5" t="s"><v>2</v></c></row>
      <row r="6"><c r="A6" t="inlineStr"><is><t>HR-001</t></is></c><c r="B6" t="inlineStr"><is><t>Recruitment</t></is></c><c r="C6"><v>4.5</v></c></row></sheetData></worksheet>`),
  }));
  const [s] = readXlsx(z);
  assert.equal(s!.name, "Reg & Map");
  const p = parseSheet(s!);
  assert.equal(p.header_row, 2);
  assert.deepEqual(p.rows.map((r) => [r.row_no, r.code, r.title, r.department]), [[3, "GOV-001", null, "Board"], [6, "HR-001", "Recruitment", "4.5"]]);
});

test("the real master workbook parses completely", { skip: !existsSync(WB) && "set BASELINE_XLSX" }, () => {
  const sheets = readXlsx(unzip(new Uint8Array(readFileSync(WB))));
  assert.equal(sheets.length, 34);
  const by = Object.fromEntries(sheets.map((s) => [s.name, parseSheet(s)]));
  assert.equal(by["Department Register"]!.rows.length, 174);
  assert.equal(new Set(by["Department Register"]!.rows.map((r) => r.code)).size, 174, "document ids unique");
  assert.equal(by["Process RACI Detail"]!.rows.length, 43);
  assert.equal(by["India Legal Register"]!.rows.length, 32);
  assert.equal(by["Audit Test Plan"]!.rows.length, 78);
  assert.equal(by["Cross-Functional RACI"]!.rows.length, 57);
  assert.equal(by["Legal Applicability Decisions"]!.rows.filter((r) => /^AP-/.test(r.code ?? "")).length, 44);
  const f = workbookFacts(sheets);
  assert.equal(f.version, "4.2"); assert.equal(f.asOf, "2026-11-21");
  console.log(JSON.stringify(Object.fromEntries(Object.entries(by).map(([k, v]) => [k, [v.header_row, v.rows.length, v.rows.filter((r) => r.code).length]]))));
});
