// Discovery engine v2 — mocked/pure tests (no network). Run: node --experimental-strip-types --test supabase/functions/tests/discovery.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildUserMessageV2, decideCompletionV2, isRepeatV2, mergeProcess, mergeResponsibilities, openingQuestion, processCompleteness,
  processSufficient, progressV2, sanitizeFlow, slug, validateTurnV2, PROFILE_FIELDS, type ContextV2, type KnownProcess,
} from "../_shared/discovery.ts";

const ctx = (over: Partial<ContextV2> = {}): ContextV2 => ({
  company: "Synthetic Co", campaignPurpose: "x", department: "Operations", knownProfile: { name: "Asha" }, profile: {},
  responsibilities: [], processes: [], stage: "person", focusProcessKey: null, inventoryConfirmed: false,
  transcript: [{ ref: "Q1", answerId: "a1", question: "Role?", answer: "Field officer" }, { ref: "Q2", answerId: "a2", question: "Work?", answer: "Address checks" }],
  latestRef: "Q2", openClarifications: [], aiQuestionsAsked: 1, maxAiQuestions: 60, ...over,
});
const good = (over: Record<string, unknown> = {}) => JSON.stringify({
  understood_answer: "Does address checks", intent: "answer", acknowledgement: "Got it.",
  profile_updates: [{ field: "designation", value: "Field officer" }, { field: "shoe_size", value: "9" }],
  responsibilities: [{ name: "Address verification", kind: "daily" }],
  process_updates: [{ key: "Address Verification!", name: "Address verification", coverage: [{ dimension: "purpose", status: "partial" }, { dimension: "nope", status: "sufficient" }] }],
  flow: { process_key: "address_verification", nodes: [{ id: "s1", type: "start", label: "Receive case" }, { id: "s2", type: "step", label: "Visit address" }, { id: "s2", type: "step", label: "dup" }],
    edges: [{ from: "s1", to: "s2" }, { from: "s2", to: "zz" }, { from: "s1", to: "s2" }] },
  stage: "responsibilities", focus_process_key: "address_verification", inventory_confirmed: false,
  next_question: { question: "What starts a verification?", reason: "To understand the trigger.", kind: "follow_up" },
  completion_assessment: { sufficient_information: false, recommended_next_action: "continue" }, ...over,
});

test("validate: drops unknown profile fields/dimensions, slugs keys, sanitises flow", () => {
  const v = validateTurnV2(good(), ctx());
  assert.equal(v.ok, true); if (!v.ok) return;
  assert.deepEqual(v.turn.profile_updates.map((p) => p.field), ["designation"]);
  assert.equal(v.turn.process_updates[0]!.key, "address_verification");
  assert.deepEqual(v.turn.process_updates[0]!.coverage!.map((c) => c.dimension), ["purpose"]);
  assert.equal(v.turn.flow!.nodes.length, 2, "duplicate node id dropped");
  assert.equal(v.turn.flow!.edges.length, 1, "dangling and duplicate edges dropped");
  assert.ok(v.dropped.includes("profile field"));
});
test("validate: rejects missing question / invalid JSON; flow for unknown process is dropped", () => {
  assert.equal(validateTurnV2("{oops", ctx()).ok, false);
  assert.equal(validateTurnV2(good({ next_question: { question: "" } }), ctx()).ok, false);
  const v = validateTurnV2(good({ process_updates: [], flow: { process_key: "ghost", nodes: [], edges: [] } }), ctx());
  assert.equal(v.ok && v.turn.flow, null);
});
test("validate: an update for a known process by name keeps the existing key", () => {
  const known: KnownProcess = { key: "file_check", name: "File verification", status: "in_discovery", completeness: 10, coverage: {}, flow: { nodes: [], edges: [] } };
  const v = validateTurnV2(good({ process_updates: [{ key: "something_else", name: "file verification" }], flow: null }), ctx({ processes: [known] }));
  assert.equal(v.ok && v.turn.process_updates[0]!.key, "file_check");
});
test("validate: contradiction refs must exist", () => {
  const v = validateTurnV2(good({ contradictions: [{ earlier_answer_ref: "Q1", later_answer_ref: "Q9", description: "x" }, { earlier_answer_ref: "Q1", later_answer_ref: "Q2", description: "y" }] }), ctx());
  assert.equal(v.ok && v.turn.contradictions.length, 1);
});
test("sanitizeFlow bounds size and coerces node types", () => {
  const f = sanitizeFlow({ nodes: Array.from({ length: 60 }, (_, i) => ({ id: "n" + i, type: "weird", label: "L" + i })), edges: [] });
  assert.equal(f.nodes.length, 40); assert.equal(f.nodes[0]!.type, "step");
  assert.deepEqual(sanitizeFlow(null), { nodes: [], edges: [] });
});
test("mergeProcess: coverage never downgrades; completeness follows coverage, model cannot inflate it", () => {
  const cur: KnownProcess = { key: "p", name: "P", status: "in_discovery", completeness: 0, coverage: { purpose: "sufficient" }, flow: { nodes: [], edges: [] } };
  const m = mergeProcess(cur, { key: "p", name: "P", completeness: 95, coverage: [{ dimension: "purpose", status: "partial" }, { dimension: "trigger", status: "sufficient" }] });
  assert.equal(m.coverage.purpose, "sufficient"); assert.equal(m.coverage.trigger, "sufficient");
  assert.ok(m.completeness <= processCompleteness(m.coverage) + 10);
});
test("processSufficient (20 dimensions, D-086): critical sufficient or N/A, at most 4 optional untouched", () => {
  const crit = ["purpose", "trigger", "input", "owner", "activities", "decisions", "output", "exceptions", "controls"];
  const all = Object.fromEntries(crit.map((k) => [k, "sufficient"])) as Record<string, "sufficient">;
  assert.equal(processSufficient(all), false, "11 optional untouched");
  const seven = Object.fromEntries(["source", "participants", "systems", "approvals", "recipient", "sla", "escalation"].map((k) => [k, "partial"]));
  assert.equal(processSufficient({ ...all, ...seven } as any), true, "4 optional untouched is enough");
  assert.equal(processSufficient({ ...all, ...seven, decisions: "not_applicable" } as any), true, "N/A counts as covered");
  assert.equal(processSufficient({ ...all, ...seven, decisions: "partial" } as any), false, "critical partial");
  assert.equal(processCompleteness({}), 0);
});
test("legacy 10-dimension coverage maps conservatively to the 20", async () => {
  const { normaliseCoverage, completeness } = await import("../_shared/dimensions.ts");
  const old = Object.fromEntries(["purpose", "trigger", "roles", "activities", "systems", "tat", "controls", "exceptions", "dependencies", "performance"].map((k) => [k, "sufficient"]));
  const n = normaliseCoverage(old);
  assert.equal(n.trigger, "sufficient"); assert.equal(n.input, "partial"); assert.equal(n.decisions, "partial"); assert.equal(n.sla, "sufficient");
  assert.equal(n.output, "not_started", "output was never asked before");
  assert.equal(processSufficient(old as any), false, "old 'complete' is not complete under the 20");
  assert.ok(completeness(old) > 50 && completeness(old) < 100);
  assert.equal(normaliseCoverage({ bogus: "sufficient", purpose: "weird" }).purpose, "not_started");
});
test("completion: requires core profile + confirmed inventory + sufficient processes + model agreement; or budget", async () => {
  const { DIM_KEYS } = await import("../_shared/dimensions.ts");
  const cov = Object.fromEntries(DIM_KEYS.map((k) => [k, "sufficient"])) as Record<string, "sufficient">;
  const p: KnownProcess = { key: "p", name: "P", status: "sufficient", completeness: 100, coverage: cov, flow: { nodes: [], edges: [] } };
  const prof = { designation: "x", department: "y", reporting_manager: "z", functions_handled: "f" };
  assert.equal(decideCompletionV2(prof, {}, true, [p], 0, "complete", 5, 60).complete, true);
  assert.equal(decideCompletionV2(prof, {}, false, [p], 0, "complete", 5, 60).complete, false, "inventory not confirmed");
  assert.equal(decideCompletionV2({ designation: "x" }, {}, true, [p], 0, "complete", 5, 60).complete, false, "core profile missing");
  assert.equal(decideCompletionV2(prof, {}, true, [p], 1, "complete", 5, 60).complete, false, "open clarification");
  assert.equal(decideCompletionV2({}, {}, false, [], 0, "continue", 60, 60).complete, true, "budget reached");
});
test("suggestions (D-084): max 3, distinct, no echoes, no screen options, no invented numbers", async () => {
  const { cleanSuggestions, SYSTEM_PROMPT_V2, TURN_SCHEMA_V2 } = await import("../_shared/discovery.ts");
  const q = "Who decides which branch handles a new case?";
  const out = cleanSuggestions(["The Operations Manager assigns it manually", "the operations manager assigns it manually.", "I don't know",
    "Not applicable", "Who decides which branch handles a new case", "Closed within 2 days", "Within 48 hours of receipt",
    "The branch manager decides", "The system assigns it automatically", "A fourth one"], q, "we close most cases in 48 hours");
  assert.deepEqual(out, ["The Operations Manager assigns it manually", "Within 48 hours of receipt", "The branch manager decides"]);
  assert.deepEqual(cleanSuggestions("nope", q, ""), []);
  assert.deepEqual(cleanSuggestions(["1. Yes, that is everything"], "Anything else?", ""), ["Yes, that is everything"]);
  assert.match(SYSTEM_PROMPT_V2, /up to 3 short answers/);
  assert.ok((TURN_SCHEMA_V2 as any).properties.next_question.properties.suggestions);
});
test("validateTurnV2 carries cleaned suggestions; grounding includes the transcript", async () => {
  const { validateTurnV2 } = await import("../_shared/discovery.ts");
  const raw = JSON.stringify({ understood_answer: "u", intent: "answer", stage: "process_deep_dive",
    next_question: { question: "How long does it take?", reason: "r", kind: "follow_up", suggestions: ["About 3 days", "About 9 days", "Same day"] },
    completion_assessment: { sufficient_information: false, recommended_next_action: "continue" } });
  const v = validateTurnV2(raw, { transcript: [{ ref: "Q1", question: "q", answer: "usually 3 days" }], openClarifications: [], processes: [] });
  assert.ok(v.ok); if (!v.ok) return;
  assert.deepEqual(v.turn.next_question.suggestions, ["About 3 days", "Same day"]);
});
test("answer in action (D-087): new steps by map comparison; otherwise every 3rd answer", async () => {
  const { answerInAction } = await import("../_shared/discovery.ts");
  const prev = { nodes: [{ id: "s", type: "start" as const, label: "Case received" }, { id: "a", type: "step" as const, label: "Check file" }], edges: [] };
  const next = { nodes: [...prev.nodes, { id: "b", type: "step" as const, label: "Assign officer" }, { id: "e", type: "end" as const, label: "Done" }], edges: [] };
  const t = { understood_answer: "The branch assigns an officer", missing_information: ["who backs up", "b", "c", "d"], dependencies: ["Operations"] };
  const x = answerInAction(prev, next, t, "Case allocation", ["Branch"], 1)!;
  assert.deepEqual(x.steps_added, ["Assign officer"]); assert.deepEqual(x.departments, ["Branch", "Operations"]); assert.equal(x.unclear.length, 3);
  assert.equal(answerInAction(prev, prev, t, null, [], 2), null);
  assert.ok(answerInAction(prev, prev, t, null, [], 3));
});
test("blueprint, colleagues and department knowledge reach the model as background", async () => {
  const { buildUserMessageV2 } = await import("../_shared/discovery.ts");
  const m = JSON.parse(buildUserMessageV2({ company: "C", campaignPurpose: null, department: "OPS", knownProfile: {}, profile: {}, responsibilities: [], processes: [],
    stage: "person", focusProcessKey: null, inventoryConfirmed: false, transcript: [], latestRef: "Q1", openClarifications: [], aiQuestionsAsked: 0, maxAiQuestions: 10,
    companyBlueprint: "COMPANY OPERATING BLUEPRINT version 1", departmentKnowledge: [{ process: "Allocation", steps: ["Assign officer"] }],
    colleagueAnswers: [{ ref: "Q2", colleague_role: "Branch Manager", reply: "We use the tracker" }] }));
  assert.match(m.company_blueprint, /^COMPANY OPERATING BLUEPRINT/); assert.equal(m.department_knowledge[0].steps[0], "Assign officer");
  assert.equal(m.colleague_answers[0].colleague_role, "Branch Manager");
});
test("progress: weighted profile / inventory / processes", () => {
  assert.equal(progressV2({}, {}, false, 0, []), 0);
  const full = Object.fromEntries(PROFILE_FIELDS.map((f) => [f, "v"]));
  assert.equal(progressV2(full, {}, true, 5, []), 30);
  assert.equal(progressV2(full, {}, true, 5, [{ key: "p", name: "P", status: "sufficient", completeness: 100, coverage: {}, flow: { nodes: [], edges: [] } }]), 100);
});
test("responsibilities merge by name; opener uses known designation; slug; rephrase is not a repeat", () => {
  assert.equal(mergeResponsibilities([{ name: "MIS", kind: "daily" }], [{ name: "mis", kind: "weekly" }, { name: "Escalations", kind: "exception" }]).length, 2);
  assert.match(openingQuestion("Asha", { designation: "Branch Head" }).text, /Branch Head/);
  assert.match(openingQuestion("", {}).text, /designation/);
  assert.equal(slug("Client Escalations & MSME!"), "client_escalations_msme");
  assert.equal(isRepeatV2("What starts a verification case?", "rephrase", ["What starts a verification case?"]), false);
  assert.equal(isRepeatV2("What starts a verification case?", "follow_up", ["What starts a verification case?"]), true);
});
test("user message carries no phone numbers or e-mails and includes missing profile fields", () => {
  const m = buildUserMessageV2(ctx({ knownProfile: { name: "Asha" } }));
  assert.doesNotMatch(m, /@|\+91|\d{10}/);
  assert.ok(JSON.parse(m).profile_fields_missing.includes("designation"));
});

import { needsInventoryNudge } from "../_shared/discovery.ts";
test("inventory nudge: only when work was described and nothing is in the inventory yet", () => {
  const t = (resp: number, procs: number) => ({ responsibilities: Array(resp).fill({ name: "x", kind: "daily" }), process_updates: Array(procs).fill({ key: "k", name: "K" }) });
  assert.equal(needsInventoryNudge({ processes: [], responsibilities: [] }, t(2, 0)), true);
  assert.equal(needsInventoryNudge({ processes: [], responsibilities: [{ name: "a", kind: "daily" }] }, t(0, 0)), true);
  assert.equal(needsInventoryNudge({ processes: [], responsibilities: [] }, t(0, 0)), false);   // still talking about the person
  assert.equal(needsInventoryNudge({ processes: [], responsibilities: [] }, t(2, 1)), false);
  assert.equal(needsInventoryNudge({ processes: [{ key: "k", name: "K", status: "identified", completeness: 0, coverage: {}, flow: { nodes: [], edges: [] } }], responsibilities: [] }, t(2, 0)), false);
});

import { buildUserMessageV2 as bum } from "../_shared/discovery.ts";
test("privacy: the employee's own name is never sent to the model", () => {
  const msg = bum({ company: "C", campaignPurpose: null, department: "Ops", knownProfile: { name: "Asha Patil", designation: "Exec" },
    profile: { name: "Asha Patil" }, responsibilities: [], processes: [], stage: "person", focusProcessKey: null, inventoryConfirmed: false,
    transcript: [], latestRef: "Q1", openClarifications: [], aiQuestionsAsked: 0, maxAiQuestions: 10 });
  assert.doesNotMatch(msg, /Asha|Patil/);
  assert.match(msg, /known — not shared/);
  assert.match(msg, /Exec/);
});
