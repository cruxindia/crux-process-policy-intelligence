import { test } from "node:test";
import assert from "node:assert/strict";
import { controlFieldFinding, inDocument, rankCandidates, validateDocAnalysis, type Candidate } from "../_shared/doc-analysis.ts";

const items: Candidate[] = [
  { code: "HR-004", title: "Leave & Attendance Policy", department: "Human Resources", should_contain: "Leave types; eligibility; approval; attendance capture" },
  { code: "FIN-007", title: "Travel & Expense Reimbursement Policy", department: "Finance & Accounts", should_contain: "Eligibility; limits; approval; claims; receipts" },
  { code: "OPS-003", title: "Field Verification SOP", department: "Operations / Service Delivery", should_contain: "Case allocation; visit; photos; report; TAT" },
];
const doc = "Travel Policy\n1. Purpose: rules for official travel.\n2. Eligibility: all staff on company work.\nClaims are submitted to the accounts team within 7 days with bills.";

test("candidates ranked by wording with a department boost", () => {
  assert.equal(rankCandidates("Travel Policy 15.10.26", doc, items, "FIN", 2)[0]!.code, "FIN-007");
  assert.equal(rankCandidates("Leave rules", "Leave types and approval", items, null, 1)[0]!.code, "HR-004");
});

test("validation keeps only candidate codes, real quotes and known departments", () => {
  const raw = JSON.stringify({ kind: "policy", summary: "Rules for official travel and claims.", departments: ["FIN", "XX"],
    control_fields: { version: true }, processes: [{ name: "Travel claim", department: "FIN", nodes: [{ id: "s", type: "start", label: "Trip done" }, { id: "a", type: "step", label: "Submit claim", actor: "Employee" }, { id: "z", type: "end", label: "Paid" }],
      edges: [{ from: "s", to: "a" }, { from: "a", to: "z" }, { from: "a", to: "missing" }] }],
    matches: [{ code: "FIN-007", coverage: "partial" }, { code: "LAW-999", coverage: "full" }],
    gaps: [{ kind: "no_approval", severity: "high", text: "Nobody approves the claim before payment.", evidence: "" },
           { kind: "missing_sla", severity: "low", text: "Payment time is not stated.", evidence: "claims are submitted to the ACCOUNTS team within 7 days" },
           { kind: "other", severity: "medium", text: "Limits for hotels are missing.", evidence: "hotel limit is Rs 3000" }],
    risks: [{ risk: "Duplicate claims", mitigation: "Check bill numbers before payment", severity: "medium" }], questions: [{ department: "FIN", question: "Who approves travel claims and up to what amount?" }] });
  const v = validateDocAnalysis(raw, ["FIN-007", "HR-004"], doc);
  assert.ok(v.ok);
  if (!v.ok) return;
  assert.deepEqual(v.result.departments, ["FIN"]);
  assert.deepEqual(v.result.matches.map((m) => m.code), ["FIN-007"]);
  assert.equal(v.dropped.codes, 1);
  assert.equal(v.result.processes[0]!.flow.edges.length, 2, "edge to an unknown node dropped");
  assert.equal(v.result.gaps[1]!.evidence !== null, true, "a real quote is kept");
  assert.equal(v.result.gaps[2]!.evidence, null, "an invented quote is dropped"); assert.equal(v.dropped.evidence, 1);
  assert.equal(v.result.control_fields.version, true); assert.equal(v.result.control_fields.approver, false);
});

test("bad output is rejected; quotes are matched loosely on spacing and case", () => {
  assert.equal(validateDocAnalysis("nope", [], doc).ok, false);
  assert.equal(validateDocAnalysis(JSON.stringify({ summary: "x", processes: [], gaps: [] }), [], doc).ok, false);
  assert.ok(inDocument("ELIGIBILITY:   all staff", "eligibility all staff on company work"));
});

test("missing control fields become one finding", () => {
  assert.equal(controlFieldFinding({ document_id: true, version: true, effective_date: true, owner: true, approver: true, review_date: true }), null);
  const f = controlFieldFinding({ version: true });
  assert.match(f!.title, /document number, effective date, owner, approver, next review date/); assert.equal(f!.severity, "high");
});
