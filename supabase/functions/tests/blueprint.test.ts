// Blueprint synthesis — pure tests. Run: node --experimental-strip-types --test supabase/functions/tests/blueprint.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { BLUEPRINT_SCHEMA, BLUEPRINT_SYSTEM, buildBlueprintMessage, buildBlueprintSources, looksLikeTarget, plainName, validateProposal } from "../_shared/blueprint.ts";

const leaders = [[{ section: "purpose", question: "Why does CRUX exist?", answer: "We verify borrowers for banks.", kind: "answer" },
  { section: "risk_appetite", question: "Which risks?", answer: "", kind: "unknown" }]];
const src = buildBlueprintSources(leaders, ["Cases are assigned on WhatsApp", "Officers wait for address clarifications"]);

test("sources: leadership answers then employee statements, numbered", () => {
  assert.equal(src.length, 4);
  assert.match(src[0]!.text, /^Leader 1 of 1, area "purpose"\. Question: Why does CRUX exist\? Answer: We verify borrowers/);
  assert.match(src[1]!.text, /Answer: \(unknown\)$/);
  assert.match(src[2]!.text, /^Employee interview statement: Cases are assigned/);
  assert.deepEqual(src.map((s) => s.ref), ["S1", "S2", "S3", "S4"]);
  const m = JSON.parse(buildBlueprintMessage(src, [{ section: "purpose", statement: "x" }], ["q"], ["Turnaround"]));
  assert.deepEqual(m.already_agreed, ["[purpose] x"]); assert.deepEqual(m.ctqs_already_listed, ["Turnaround"]);
});

test("the prompt forbids targets and the schema has no target field", () => {
  assert.match(BLUEPRINT_SYSTEM, /NEVER give a target/);
  const ctqProps = Object.keys((BLUEPRINT_SCHEMA as any).properties.ctqs.items.properties);
  assert.ok(!ctqProps.some((k) => /target|threshold|goal/.test(k)), ctqProps.join(","));
});

test("targets are recognised", () => {
  for (const t of ["95% within SLA", "Closed within 3 days", "at least 40 cases per officer", "TAT under 48 hours", ">= 98"]) assert.ok(looksLikeTarget(t), t);
  for (const t of ["Share of cases closed within the client's agreed turnaround", "Rework rate on submitted reports", "Escalations per month"]) assert.ok(!looksLikeTarget(t), t);
});

test("validation: uncited, invented refs, targets and duplicates are dropped", () => {
  const raw = JSON.stringify({
    entries: [
      { section: "purpose", statement: "CRUX verifies borrowers for banks.", source_refs: ["S1"] },
      { section: "purpose", statement: "An uncited claim.", source_refs: ["S99"] },
      { section: "voe", statement: "Officers wait for address clarifications.", source_refs: ["S4", "S4"] },
      { section: "nonsense", statement: "x y z", source_refs: ["S1"] },
      { section: "customers", statement: "Banks are the customers of CRUX.", source_refs: ["S1"] },
    ],
    ctqs: [
      { name: "Turnaround", voice: "voc", measure: "Share of cases closed within the client's agreed turnaround", direction: "higher_better", source_refs: ["S1"] },
      { name: "Accuracy", voice: "voc", measure: "95% of reports right first time", direction: "higher_better", source_refs: ["S1"] },
      { name: "Waiting time", voice: "voe", measure: "Hours lost waiting for clarifications", direction: "lower_better", source_refs: [] },
    ],
    open_questions: [{ section: "risk_appetite", question: "Which risks must never happen at CRUX?" }, { section: "risk_appetite", question: "Which risks must never happen at CRUX?" }],
  });
  const v = validateProposal(raw, src.map((s) => s.ref), { statements: ["Banks are the customers of CRUX"], ctqNames: [], openQs: [] });
  assert.ok(v.ok);
  if (!v.ok) return;
  assert.deepEqual(v.proposal.entries.map((e) => e.section), ["purpose", "voe"]);
  assert.deepEqual(v.proposal.entries[1]!.source_refs, ["S4"]);
  assert.deepEqual(v.proposal.ctqs.map((c) => c.name), ["Turnaround"]);
  assert.equal(v.proposal.open_questions.length, 1);
  assert.deepEqual(v.dropped, { uncited: 2, targets: 1, duplicates: 2 });
  assert.equal(validateProposal("not json", [], { statements: [], ctqNames: [], openQs: [] }).ok, false);
  assert.equal(validateProposal('{"entries":[]}', [], { statements: [], ctqNames: [], openQs: [] }).ok, false);
});

test("published blueprint becomes one board source; the board task then demands alignment and no invented targets", async () => {
  const { blueprintSourceText } = await import("../_shared/blueprint.ts");
  const { buildSources, buildTurnMessage, buildPlan } = await import("../_shared/board.ts");
  const text = blueprintSourceText(2, { sections: { purpose: ["Verification for lenders"], objectives: ["Grow MSME"] },
    ctqs: [{ code: "CTQ-01", name: "Turnaround", measure: "Share within SLA", unit: "%", target_value: 95, target_text: null }] });
  assert.match(text, /^COMPANY OPERATING BLUEPRINT version 2 \(agreed by management\)\. Purpose: Verification for lenders\. Business objectives: Grow MSME\./);
  assert.match(text, /CTQ-01 Turnaround — measure: Share within SLA \(%\); approved target: 95/);
  const src = buildSources("brief", [], text);
  assert.deepEqual(src.map((s) => s.ref), ["S0", "S1"]);
  const msg = JSON.parse(buildTurnMessage({ kind: "document_draft", docType: "sop", title: "T", brief: "brief", classification: "internal" }, buildPlan("document_draft", "sop")[0]!, src, [], null, null));
  assert.match(msg.your_turn.task, /Align the document with the COMPANY OPERATING BLUEPRINT/);
  const none = JSON.parse(buildTurnMessage({ kind: "document_draft", docType: "sop", title: "T", brief: "brief", classification: "internal" }, buildPlan("document_draft", "sop")[0]!, buildSources("brief", []), [], null, null));
  assert.doesNotMatch(none.your_turn.task, /BLUEPRINT/);
});

test("CTQ names come back in plain words; the prompt asks for split facts", () => {
  assert.equal(plainName("case_turnaround"), "Case turnaround"); assert.equal(plainName("Rework rate"), "Rework rate");
  assert.match(BLUEPRINT_SYSTEM, /Split an answer that holds several facts/);
  const v = validateProposal(JSON.stringify({ entries: [], open_questions: [], ctqs: [{ name: "rework_rate", voice: "voc", measure: "Reports sent back for correction", direction: "lower_better", source_refs: ["S1"] }] }),
    ["S1"], { statements: [], ctqNames: [], openQs: [] });
  assert.ok(v.ok && v.proposal.ctqs[0]!.name === "Rework rate");
});
