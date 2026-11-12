// Run: node --experimental-strip-types --test web/lib/sop.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { draftSop } from "./sop.ts";

test("linear flow becomes numbered steps with trigger; missing end is flagged", () => {
  const r = draftSop({ nodes: [{ id: "s1", type: "start", label: "Bank emails case list" }, { id: "s2", type: "step", label: "Sort by pincode", system: "Excel" },
    { id: "s3", type: "step", label: "Assign on WhatsApp" }], edges: [{ from: "s1", to: "s2" }, { from: "s2", to: "s3" }] });
  assert.deepEqual(r.lines.map((l) => `${l.n}:${l.text}`), ["Trigger:Bank emails case list", "1:Sort by pincode", "2:Assign on WhatsApp"]);
  assert.equal(r.lines[1]!.system, "Excel");
  assert.ok(r.gaps.some((g) => /end of the process/.test(g)));
});
test("decision branches become If-lines; a one-sided decision is a gap, never filled in", () => {
  const r = draftSop({ nodes: [{ id: "a", type: "step", label: "Check report" }, { id: "d", type: "decision", label: "Complete?" },
    { id: "y", type: "step", label: "Submit to portal" }, { id: "e", type: "end", label: "Closed" }],
    edges: [{ from: "a", to: "d" }, { from: "d", to: "y", label: "yes" }, { from: "y", to: "e" }] });
  assert.deepEqual(r.lines.map((l) => `${l.n}:${l.text}`), ["1:Check report", "2:Decide: Complete?", "2.a:If yes: Submit to portal", "End:Closed"]);
  assert.ok(r.gaps.some((g) => /only one outcome/.test(g)));
  assert.ok(!r.gaps.some((g) => /end of the process/.test(g)));
});
test("disconnected step is listed and flagged; empty flow gives nothing", () => {
  const r = draftSop({ nodes: [{ id: "a", type: "start", label: "Start" }, { id: "b", type: "step", label: "B" }, { id: "x", type: "step", label: "Loose" }],
    edges: [{ from: "a", to: "b" }, { from: "x", to: "x" }] });
  assert.ok(r.lines.some((l) => l.text === "Loose"));
  assert.deepEqual(draftSop(null), { lines: [], gaps: [] });
});
test("cycles do not loop forever", () => {
  const r = draftSop({ nodes: [{ id: "a", type: "step", label: "A" }, { id: "b", type: "step", label: "B" }], edges: [{ from: "a", to: "b" }, { from: "b", to: "a" }] });
  assert.equal(r.lines.length, 2);
});
