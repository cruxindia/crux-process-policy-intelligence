// Routing / quota helpers — pure tests. Run: node --experimental-strip-types --test supabase/functions/tests/routing.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { cooldownFor, healthFor, nextPacificMidnight, rankConnections, savedMessage, type Conn } from "../_shared/routing.ts";

const conn = (over: Partial<Conn>): Conn => ({ id: "x", name: "x", provider: "gemini", policy_provider: "gemini_free", model: "m", base_url: null,
  priority: 100, status: "active", cooldown_until: null, has_key: true, assignments: [], ...over });

test("routing: department-assigned first, then shared pool; other departments' projects never used", () => {
  const ops = conn({ id: "ops", name: "Ops", assignments: [{ department_id: "D-OPS", process_id: null, interview_category: null, active: true }] });
  const fin = conn({ id: "fin", name: "Fin", assignments: [{ department_id: "D-FIN", process_id: null, interview_category: null, active: true }] });
  const pool = conn({ id: "pool", name: "Pool" });
  assert.deepEqual(rankConnections([pool, fin, ops], { departmentId: "D-OPS", processId: null, category: "discovery" }).map((c) => c.id), ["ops", "pool"]);
  assert.deepEqual(rankConnections([pool, fin, ops], { departmentId: "D-HR", processId: null, category: "discovery" }).map((c) => c.id), ["pool"]);
});
test("routing: process beats department; priority breaks ties; inactive assignment ignored", () => {
  const dept = conn({ id: "dept", name: "A", priority: 1, assignments: [{ department_id: "D", process_id: null, interview_category: null, active: true }] });
  const proc = conn({ id: "proc", name: "B", priority: 500, assignments: [{ department_id: null, process_id: "P", interview_category: null, active: true }] });
  const off = conn({ id: "off", name: "C", assignments: [{ department_id: "D", process_id: null, interview_category: null, active: false }] });
  assert.deepEqual(rankConnections([dept, proc, off], { departmentId: "D", processId: "P", category: "discovery" }).map((c) => c.id), ["proc", "dept"]);
});
test("routing: skips disabled, keyless, cooling-down; category must match", () => {
  const now = new Date("2026-11-12T05:00:00Z");
  const list = [conn({ id: "dis", status: "disabled" }), conn({ id: "nokey", has_key: false }), conn({ id: "cool", cooldown_until: "2026-11-12T06:00:00Z" }),
    conn({ id: "docs", assignments: [{ department_id: null, process_id: null, interview_category: "documents", active: true }] }), conn({ id: "ok" })];
  assert.deepEqual(rankConnections(list, { departmentId: null, processId: null, category: "discovery" }, now).map((c) => c.id), ["ok"]);
});
test("Pacific midnight: daily quota reset is computed in Los Angeles time (PST and PDT)", () => {
  // 12 Nov 2026 05:00 UTC = 11 Nov 21:00 PST -> next reset 12 Nov 08:00 UTC
  assert.equal(nextPacificMidnight(new Date("2026-11-12T05:00:00Z")).toISOString(), "2026-11-12T08:00:00.000Z");
  // 1 Jul 2026 12:00 UTC = 05:00 PDT -> next reset 2 Jul 07:00 UTC
  assert.equal(nextPacificMidnight(new Date("2026-07-01T12:00:00Z")).toISOString(), "2026-07-02T07:00:00.000Z");
});
test("cooldown follows the provider's own retry info; health labels; employee message never mentions quota", () => {
  const now = new Date("2026-11-12T05:00:00Z");
  assert.equal(cooldownFor("rate_limit", "please try again in about 37 seconds", now)!.toISOString(), "2026-11-12T05:00:37.000Z");
  assert.equal(cooldownFor("rate_limit", "free daily limit has been used up; continue tomorrow", now)!.toISOString(), "2026-11-12T08:00:00.000Z");
  assert.equal(cooldownFor("timeout", "x", now), null);
  assert.equal(healthFor(false, "config", 404), "model_unavailable");
  assert.equal(healthFor(false, "auth"), "auth_failed");
  assert.equal(healthFor(true), "connected");
  const msg = savedMessage(new Date("2026-11-12T05:20:00Z"), now);
  assert.match(msg, /safely saved/); assert.match(msg, /about 20 minutes/); assert.doesNotMatch(msg, /quota|limit|Gemini|API/i);
});
