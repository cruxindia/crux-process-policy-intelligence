import { test } from "node:test";
import assert from "node:assert/strict";
import { classify, mayShareText } from "./doc-classify.ts";

const cases: [string, string, string, string, string | null][] = [
  ["Leave Policy 2026.docx", "", "governing", "policy", "HR"],
  ["SOP - Field Executive.docx", "Operations", "governing", "sop", "OPS"],
  ["Guidelines for Auditing Verification Reports.docx", "", "governing", "guideline", "OPS"],
  ["KRA - Zonal Head.docx", "", "governing", "role", "HR"],
  ["Expense Reimbursement Form.xlsx", "Finance", "governing", "form", "FIN"],
  ["Appointment Letter - Test Person.docx", "HR/Letters", "record", "employee letter", "HR"],
  ["Board Resolution - bank account.docx", "", "record", "minutes or resolution", "GOV"],
  ["Warning letter - Test Person.docx", "", "sensitive", "disciplinary record", "HR"],
  ["Salary revision 2026.docx", "", "sensitive", "pay or money of a person", "HR"],
  ["Police complaint against vendor.docx", "", "sensitive", "legal or police matter", "LRC"],
  ["Aadhar Front.jpeg", "", "sensitive", "identity or bank document", null],
  ["IMG_2201.jpg", "", "record", "photo or scan", null],
];
test("classification by name and folder", () => {
  for (const [n, f, cat, type, dept] of cases) {
    const c = classify(n, f);
    assert.deepEqual([c.category, c.docType, c.department], [cat, type, dept], n);
  }
});
test("text shaped like a policy turns an unclear name into a governing document", () => {
  const c = classify("Branch head.docx", "", "1. Purpose\nThis note sets out ... 2. Scope\nAll branches ... 3. Responsibilities\nThe branch head ...");
  assert.equal(c.category, "governing");
  assert.equal(classify("Branch head.docx").category, "record");
});
test("sensitive names win even when the text looks like a policy; only governing text may be shared", () => {
  const c = classify("Show cause notice.docx", "", "Purpose ... Scope ... Responsibilities");
  assert.equal(c.category, "sensitive"); assert.equal(mayShareText(c), false);
  assert.equal(mayShareText(classify("Travel Policy.docx")), true);
});
test("rule documents may carry sensitive words; identity papers never", () => {
  assert.equal(classify("Health and Safety Policy.docx").category, "governing");
  assert.equal(classify("Warning letter template.docx").category, "governing");
  assert.equal(classify("Passport policy copy.pdf").category, "sensitive");
});
