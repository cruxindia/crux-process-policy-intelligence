// Deterministic comparison of descriptions — run: node --experimental-strip-types --test supabase/functions/tests/compare.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { compareDescriptions, comparisonAnnex, comparisonText, dice, stepTokens } from "../_shared/compare.ts";

const s = (label: string) => ({ label, decision: label.endsWith("?") });
// The three synthetic interviews used in the live test (E2E-SYNTH), in the order the board numbers them.
const D1 = ["Receive case list email from bank", "Open Excel and sort by pincode", "Is officer on leave?", "Assign to nearest officer",
  "Assign cases by area to field officers", "Is address incomplete?", "Call the bank coordinator"].map(s);
const D2 = ["Bank emails case list", "Download case list, sort by pincode, and assign by area", "Assign cases to field officers on WhatsApp",
  "Is the address complete?", "Call bank coordinator for clarification"].map(s);
const D3 = ["Receive bank email with case list", "Download and open Excel, sort by pincode", "Is officer on leave?", "Assign cases by area",
  "Give cases to the nearest officer"].map(s);
const who = (rows: ReturnType<typeof compareDescriptions>, re: RegExp) =>
  rows.find((r) => r.steps.some((x) => x && re.test(x.label)))!.steps.map((x, d) => (x ? d + 1 : 0)).filter(Boolean);

test("tokens are stemmed and stop words dropped", () => {
  assert.deepEqual([...stepTokens("Bank emails the case lists")], ["bank", "email", "case", "list"]);
  assert.ok(dice(stepTokens("Bank emails case list"), stepTokens("Receive bank email with case list")) > 0.8);
});

test("real synthetic data: who mentioned which step is computed correctly", () => {
  const rows = compareDescriptions([D1, D2, D3]);
  assert.deepEqual(who(rows, /officer on leave/i), [1, 3], "leave check: descriptions 1 and 3 only");
  assert.deepEqual(who(rows, /address/i), [1, 2], "address check: descriptions 1 and 2 only");
  assert.deepEqual(who(rows, /coordinator/i), [1, 2]);
  assert.deepEqual(who(rows, /nearest officer/i), [1, 3]);
  assert.deepEqual(who(rows, /email/i), [1, 2, 3]);
  assert.deepEqual(who(rows, /WhatsApp/i), [1, 2, 3], "assigning by area is common; only D2's wording names WhatsApp");
  assert.ok(rows.every((r) => r.steps.filter(Boolean).length === new Set(r.steps.filter(Boolean)).size));
  assert.match(rows[0]!.steps[0]!.label, /Receive case list email/, "rows follow the order of the work");
});

test("no step is lost or duplicated, and one row never holds two steps of the same person", () => {
  const rows = compareDescriptions([D1, D2, D3]);
  assert.equal(rows.reduce((n, r) => n + r.steps.filter(Boolean).length, 0), D1.length + D2.length + D3.length);
});

test("text for the board and annex for the document", () => {
  const rows = compareDescriptions([D1, D2, D3]);
  const t = comparisonText(rows, 3);
  assert.match(t, /^AUTOMATIC COMPARISON of the 3 descriptions/); assert.match(t, /\[only 1, 3 of 3\]: D1: Decision: Is officer on leave\? \| D2: — not mentioned/);
  const a = comparisonAnnex(rows, 3);
  assert.match(a, /## Annex — How the 3 descriptions compare \(automatic\)/); assert.match(a, /\| 2 of 3 \|/); assert.match(a, /WhatsApp/);
  assert.doesNotMatch(a, /Neha/);
  assert.equal(compareDescriptions([[s("A step")], [s("A step")]])[0]!.everyone, true);
  assert.match(comparisonAnnex(compareDescriptions([[s("Same")], [s("Same")]]), 2), /Every step is mentioned by everyone/);
});
