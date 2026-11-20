// node --experimental-strip-types --test web/lib/recognition.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { badges, firstName, greeting } from "./recognition.ts";

const base = { answers: 0, answers_30d: 0, processes_described: 0, colleagues_helped: 0, tasks_resolved: 0, validations: 0, interview_done: false, score_30d: 0, top5: false, joined: "" };

test("no badges before any contribution; earned ones appear with a reason", () => {
  assert.deepEqual(badges(base), []);
  const b = badges({ ...base, answers: 12, interview_done: true, processes_described: 4, colleagues_helped: 1, top5: true });
  assert.deepEqual(b.map((x) => x.title), ["Voice of the work", "Interview complete", "Process mapper", "Helpful colleague", "Top contributor this month"]);
  assert.match(b[3]!.why, /1 question from/);
});

test("greeting follows India time; first name is safe", () => {
  assert.equal(greeting(Date.UTC(2026, 10, 20, 3, 0)), "Good morning");     // 08:30 IST
  assert.equal(greeting(Date.UTC(2026, 10, 20, 9, 0)), "Good afternoon");   // 14:30 IST
  assert.equal(greeting(Date.UTC(2026, 10, 20, 14, 0)), "Good evening");    // 19:30 IST
  assert.equal(firstName("  Meera   Synthetic "), "Meera"); assert.equal(firstName(null), "there");
});
