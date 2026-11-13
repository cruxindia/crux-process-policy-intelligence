// Board engine — pure tests. Run: node --experimental-strip-types --test supabase/functions/tests/board.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { BOARD_SYSTEM, buildPlan, buildSources, buildTurnMessage, lintDocument, preservationIssues, revisionSteps, validateTurn } from "../_shared/board.ts";

test("plans: right lead per document type; critics then consolidation, format, final audit", () => {
  const ag = buildPlan("document_draft", "agreement");
  assert.equal(ag[0]!.role, "legal_counsel"); assert.equal(ag[0]!.kind, "proposal");
  assert.deepEqual(ag.slice(-3).map((s) => s.kind), ["consolidation", "format", "audit"]);
  assert.equal(ag.at(-1)!.role, "audit_qa"); assert.equal(ag.at(-2)!.role, "docs_controller");
  assert.ok(ag.filter((s) => s.kind === "critique").every((s) => s.to[0] === "legal_counsel"));
  assert.equal(buildPlan("document_draft", "board_resolution")[0]!.role, "cs_secretary");
  assert.equal(buildPlan("improvement_review", null)[0]!.role, "pmo_lss_bb");
  assert.ok(buildPlan("improvement_review", null).some((s) => s.role === "finance_cfa"));
  assert.ok(!buildPlan("document_draft", "policy").filter((s) => s.kind === "critique").some((s) => s.role === "legal_compliance"), "lead does not critique itself");
  assert.deepEqual(revisionSteps("legal_counsel").map((s) => s.kind), ["consolidation", "format", "audit"]);
});
test("system rules forbid invented facts and section numbers; library is listed", () => {
  assert.match(BOARD_SYSTEM, /never invent names, numbers/i);
  assert.match(BOARD_SYSTEM, /Never state a section number/);
  assert.match(BOARD_SYSTEM, /Digital Personal Data Protection Act, 2023/);
});
test("validation: documents required for drafting turns, verdict for audit; unknown refs/roles dropped", () => {
  const prop = buildPlan("document_draft", "policy")[0]!;
  assert.equal(validateTurn(JSON.stringify({ summary: "s", message: "m" }), prop, ["S0"], ["legal_counsel"]).ok, false);
  const ok = validateTurn(JSON.stringify({ summary: "s", message: "m", document: { title: "T", body_md: "x".repeat(300) }, citations: ["S0", "S9"], addressed_to: ["legal_counsel", "hacker"] }), prop, ["S0"], ["legal_counsel"]);
  assert.ok(ok.ok); if (ok.ok) { assert.deepEqual(ok.turn.citations, ["S0"]); assert.equal(ok.dropped, 1); assert.deepEqual(ok.turn.addressed_to, ["legal_counsel"]); }
  const audit = { role: "audit_qa", kind: "audit" as const, to: ["x"] };
  assert.equal(validateTurn(JSON.stringify({ summary: "s", message: "m" }), audit, [], []).ok, false);
  const a2 = validateTurn(JSON.stringify({ summary: "s", message: "m", verdict: "revise", audit_notes: "fix 1" }), audit, [], []);
  assert.ok(a2.ok && a2.turn.verdict === "revise" && a2.turn.document === null);
});
test("sources: numbered, process facts only, no employee name field", () => {
  const s = buildSources("Need a field-agent NDA", [{ name: "Case allocation", purpose: "Assign cases", frequency: "daily", volume: null, involvement: "execute",
    owner_text: null, departments: ["Accounts"], flow: { nodes: [{ id: "s1", type: "start", label: "Receive list" }, { id: "s2", type: "step", label: "Assign" }], edges: [{ from: "s1", to: "s2" }] },
    coverage: { purpose: "sufficient" }, facts: ["Cases are split by pincode"], role: "Operations Executive" }]);
  assert.deepEqual(s.map((x) => x.ref), ["S0", "S1", "S2", "S3", "S4"]);
  assert.match(s[2]!.text, /Receive list -> Assign/);
  const msg = buildTurnMessage({ kind: "document_draft", docType: "agreement", title: "NDA", brief: "b", classification: "internal" },
    buildPlan("document_draft", "agreement")[0]!, s, [], null, null);
  assert.match(msg, /"ref":"S0"/); assert.match(msg, /Draft the complete first version/);
});

test("lintDocument flags internal codes, missing structure and missing control blocks", () => {
  const bad = "AGREEMENT\nThe Sub-Agency shall comply with the Digital Personal Data Protection Act, 2023 [L7] as advised by legal_compliance. See (S1).";
  const issues = lintDocument(bad, "formatted");
  assert.ok(issues.some((i) => /source\/library codes/.test(i)));
  assert.ok(issues.some((i) => /role codes appear in the document \(legal_compliance\)/.test(i)));
  assert.ok(issues.some((i) => /Markdown headings/.test(i)));
  assert.ok(issues.some((i) => /Title block/.test(i)));
  assert.ok(issues.some((i) => /Revision history/.test(i)));
  const good = "# Policy\n\n**Document ID:** [assigned on approval]\n\n## 1 Purpose\n\nText with [TO CONFIRM — Legal & Compliance: approver].\n\nISO 27001 and L1 support desk are fine.\n\n## Items to complete before approval\n\n- approver\n\n## 9 Revision history\n\n| v | date |\n|---|---|\n| 0.1 | [date] |";
  assert.deepEqual(lintDocument(good, "formatted"), []);
  assert.deepEqual(lintDocument("# Draft\n\nbody", "draft"), []);
});

test("v2 prompt requires markdown, plain-word placeholders and marked defaults; drafts name expected sections", () => {
  assert.match(BOARD_SYSTEM, /NEVER put source refs/);
  assert.match(BOARD_SYSTEM, /\[proposed — confirm\]/);
  const msg = JSON.parse(buildTurnMessage({ kind: "document_draft", docType: "agreement", title: "NDA", brief: "b", classification: "internal" },
    { role: "legal_counsel", kind: "proposal", to: [] }, [], [], null, null));
  assert.match(msg.your_turn.task, /limitation of liability/);
  const audit = JSON.parse(buildTurnMessage({ kind: "document_draft", docType: "policy", title: "P", brief: "", classification: "internal" },
    { role: "audit_qa", kind: "audit", to: [] }, [], [], { title: "P", body_md: "x" }, null, ["Revision history table is missing."]));
  assert.deepEqual(audit.automated_checks, ["Revision history table is missing."]);
});

test("lintDocument flags asserted statutory section numbers but not internal clause references", () => {
  const head = "# T\n\n";
  assert.ok(lintDocument(head + "authorisation under Section 179 of the Companies Act, 2013 (where applicable).", "draft").some((i) => /Section 179/.test(i)));
  assert.ok(lintDocument(head + "TDS will be deducted under Section 194J at the applicable rate.", "draft").some((i) => /Section 194J/.test(i)));
  assert.deepEqual(lintDocument(head + "Board powers under Section 179 of the Companies Act, 2013 [to be confirmed by Company Secretarial].", "draft"), []);
  assert.deepEqual(lintDocument(head + "As set out in Section 2.4 of this Agreement and Section 5 above.", "draft"), []);
});

test("preservationIssues catches formatting that drops clauses or shrinks the document", () => {
  const clauses = ["Recitals", "Definitions", "Confidentiality", "Exclusions", "Indemnity", "Limitation of liability", "Notices", "Force majeure", "Severability", "Counterparts"];
  const before = "# NDA\n\n" + clauses.map((c, i) => `## ${i + 1}. ${c.toUpperCase()}\n\n${"Clause text. ".repeat(40)}`).join("\n\n");
  const collapsed = "# NDA\n\n## 1. Recitals\n\nx\n\n## 4. Roles & Responsibilities\n\n" + "Short. ".repeat(50);
  const issues = preservationIssues(before, collapsed);
  assert.ok(issues.some((i) => /shorter/.test(i)) && issues.some((i) => /limitation of liability/.test(i)));
  const formatted = "# NDA\n\n**Document ID:** [on approval]\n\n" + before.replace("# NDA\n\n", "") + "\n\n## Revision history\n\n| v | date |\n|---|---|";
  assert.deepEqual(preservationIssues(before, formatted), []);
});

test("format task keeps contract structure for agreements", () => {
  const m = JSON.parse(buildTurnMessage({ kind: "document_draft", docType: "agreement", title: "NDA", brief: "", classification: "internal" },
    { role: "docs_controller", kind: "format", to: [] }, [], [], { title: "NDA", body_md: "x" }, null));
  assert.match(m.your_turn.task, /keep its contract structure/);
  assert.match(BOARD_SYSTEM, /Formatting never removes or merges content/);
});
