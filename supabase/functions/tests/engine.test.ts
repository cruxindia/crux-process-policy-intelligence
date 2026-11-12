// MOCKED unit tests (no network). Run: node --experimental-strip-types --test supabase/functions/tests/
import { test } from "node:test";
import assert from "node:assert/strict";
import { GeminiProvider, OllamaProvider, providerFromEnv } from "../_shared/ai-provider.ts";
import { buildUserMessage, decideCompletion, isRepeat, mergeCoverage, progressPercent, validateTurn, DIMENSION_KEYS, type Context } from "../_shared/engine.ts";

const ctx: Context = {
  company: "Synthetic Co", campaignPurpose: "Discover the main process", department: "Operations", profile: { designation: "Field officer" },
  transcript: [
    { ref: "Q1", answerId: "a1", question: "What is your designation?", answer: "Field officer" },
    { ref: "Q9", answerId: "a9", question: "What is the TAT?", answer: "TAT is 24 hours" },
    { ref: "Q10", answerId: "a10", question: "How long does a case take?", answer: "About 3 days" },
  ],
  latestRef: "Q10", coverage: { purpose: "partial" }, openClarifications: [{ id: "c1", description: "old" }], aiQuestionsAsked: 2, maxAiQuestions: 40,
};
const good = {
  understood_answer: "A case takes about 3 days.", identified_facts: ["Case takes ~3 days"], assumptions: [], missing_information: ["Who measures TAT"],
  potential_risks: [], dependencies: [], contradictions: [{ earlier_answer_ref: "Q9", later_answer_ref: "Q10", description: "24h vs 3 days" }],
  resolved_clarification_ids: ["c1"], coverage_updates: [{ dimension: "tat", status: "partial" }],
  next_question: { question: "You said 24 hours earlier and 3 days now — which cases take 3 days?", reason: "Two different times were mentioned.", discovery_dimension: "tat", priority: "high", kind: "clarification" },
  completion_assessment: { sufficient_information: false, unresolved_issues: ["TAT conflict"], recommended_next_action: "clarify" },
};

test("validateTurn accepts a well-formed turn (also inside a ```json fence)", () => {
  const v = validateTurn("```json\n" + JSON.stringify(good) + "\n```", ctx);
  assert.equal(v.ok, true);
  if (v.ok) { assert.equal(v.turn.contradictions.length, 1); assert.deepEqual(v.turn.resolved_clarification_ids, ["c1"]); }
});
test("TEST 7a: malformed JSON is rejected, never trusted", () => {
  const v = validateTurn("{not json", ctx);
  assert.equal(v.ok, false);
});
test("TEST 7b: missing next_question / bad completion is rejected", () => {
  const bad = { ...good, next_question: { question: "" } };
  assert.equal(validateTurn(JSON.stringify(bad), ctx).ok, false);
  assert.equal(validateTurn(JSON.stringify({ ...good, completion_assessment: { recommended_next_action: "maybe" } }), ctx).ok, false);
});
test("TEST 5 (plumbing): contradictions must cite real answer refs; invented refs are dropped", () => {
  const v = validateTurn(JSON.stringify({ ...good, contradictions: [{ earlier_answer_ref: "Q99", later_answer_ref: "Q10", description: "x" }] }), ctx);
  assert.equal(v.ok, true);
  if (v.ok) { assert.equal(v.turn.contradictions.length, 0); assert.ok(v.dropped.length >= 1); }
});
test("invalid dimensions and unknown clarification ids are dropped", () => {
  const v = validateTurn(JSON.stringify({ ...good, coverage_updates: [{ dimension: "astrology", status: "partial" }], resolved_clarification_ids: ["zzz"] }), ctx);
  assert.equal(v.ok, true);
  if (v.ok) { assert.equal(v.turn.coverage_updates.length, 0); assert.equal(v.turn.resolved_clarification_ids.length, 0); }
});
test("TEST 3 (plumbing): a repeated question is detected; explicit clarifications are allowed", () => {
  assert.equal(isRepeat("What is the TAT for this process?", "new_topic", ["What is the TAT?"], 0.5), true);
  assert.equal(isRepeat("What is the TAT for this process?", "clarification", ["What is the TAT?"], 0.5), false);
  assert.equal(isRepeat("Who approves refunds above the limit?", "follow_up", ["What is the TAT?"]), false);
});
test("coverage never downgrades a sufficient dimension in one turn", () => {
  assert.equal(mergeCoverage({ tat: "sufficient" }, [{ dimension: "tat", status: "partial" }]).tat, "sufficient");
  assert.equal(mergeCoverage({}, [{ dimension: "tat", status: "partial" }]).tat, "partial");
});
test("completion is decided by coverage + clarifications, not by question count", () => {
  const all = Object.fromEntries(DIMENSION_KEYS.map((k) => [k, "sufficient"])) as Record<string, "sufficient">;
  assert.equal(decideCompletion({}, 0, "complete", 5, 40).complete, false);              // model says complete, coverage empty
  assert.equal(decideCompletion(all, 1, "complete", 5, 40).complete, false);             // open contradiction blocks
  assert.equal(decideCompletion(all, 0, "complete", 5, 40).complete, true);
  assert.equal(decideCompletion({}, 0, "continue", 40, 40).complete, true);              // safety budget
});
test("TEST 8 (plumbing): prompt carries prior answers, coverage and open clarifications; no personal identifiers", () => {
  const m = JSON.parse(buildUserMessage(ctx));
  assert.equal(m.transcript.length, 3);
  assert.equal(m.transcript[1].a, "TAT is 24 hours");
  assert.equal(m.discovery_dimensions.find((d: any) => d.key === "purpose").current_status, "partial");
  assert.equal(m.open_clarifications[0].id, "c1");
  assert.ok(!/\b\d{10}\b|@/.test(JSON.stringify(m.employee)));
});
test("progress: profile 20% + coverage 80%", () => {
  assert.equal(progressPercent(8, 8, {}), 20);
  assert.equal(progressPercent(8, 8, Object.fromEntries(DIMENSION_KEYS.map((k) => [k, "sufficient"]))), 100);
});

// ---- Provider adapter (mocked fetch) ----
type Call = { url: string; init: RequestInit };
function mockFetch(responses: Array<() => Response | Promise<Response>>, calls: Call[] = []) {
  return async (url: string, init: RequestInit) => { calls.push({ url, init }); const f = responses.shift(); if (!f) throw new Error("no more"); return f(); };
}
const ok200 = (text: string) => () => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text }] }, finishReason: "STOP" }], modelVersion: "gemini-x" }), { status: 200 });
const err = (status: number, message = "e", headers: Record<string, string> = {}) => () => new Response(JSON.stringify({ error: { message } }), { status, headers });

test("TEST 6: missing API key → configuration error, no request made, no fake answer", async () => {
  const calls: Call[] = [];
  const p = new GeminiProvider(undefined, "gemini-2.5-flash", "gemini_paid", mockFetch([], calls));
  const r = await p.generateJson({ system: "s", user: "u", schema: {} });
  assert.equal(r.ok, false); if (!r.ok) assert.equal(r.errorClass, "config");
  assert.equal(calls.length, 0);
});
test("key travels in a header, never in the URL; schema requested", async () => {
  const calls: Call[] = [];
  const p = new GeminiProvider("k-secret", "m", "gemini_paid", mockFetch([ok200("{}")], calls));
  await p.generateJson({ system: "s", user: "u", schema: { type: "object" } });
  assert.ok(!calls[0]!.url.includes("k-secret"));
  assert.equal((calls[0]!.init.headers as Record<string, string>)["x-goog-api-key"], "k-secret");
  assert.ok(JSON.parse(String(calls[0]!.init.body)).generationConfig.responseJsonSchema);
});
test("TEST 7c: rate limit is retried, then succeeds", async () => {
  const p = new GeminiProvider("k", "m", "gemini_paid", mockFetch([err(429, "quota", { "retry-after": "0" }), ok200('{"ok":true}')]), 2);
  const r = await p.generateJson({ system: "s", user: "u", schema: {} });
  assert.equal(r.ok, true);
});
test("TEST 7d: persistent rate limit → honest rate_limit error", async () => {
  const p = new GeminiProvider("k", "m", "gemini_paid", mockFetch([err(429), err(429), err(429)]), 2);
  const r = await p.generateJson({ system: "s", user: "u", schema: {} });
  assert.equal(r.ok, false); if (!r.ok) assert.equal(r.errorClass, "rate_limit");
});
test("invalid key → auth error", async () => {
  const p = new GeminiProvider("bad", "m", "gemini_paid", mockFetch([err(400, "API key not valid. Please pass a valid API key.")]));
  const r = await p.generateJson({ system: "s", user: "u", schema: {} });
  assert.equal(r.ok, false); if (!r.ok) assert.equal(r.errorClass, "auth");
});
test("unsupported schema field → retried once in JSON mode", async () => {
  const calls: Call[] = [];
  const p = new GeminiProvider("k", "m", "gemini_paid", mockFetch([err(400, "Unknown name \"responseJsonSchema\""), ok200("{}")], calls));
  const r = await p.generateJson({ system: "s", user: "u", schema: { type: "object" } });
  assert.equal(r.ok, true);
  assert.equal(JSON.parse(String(calls[1]!.init.body)).generationConfig.responseJsonSchema, undefined);
});
test("timeout → timeout error", async () => {
  const hang = (_u: string, init: RequestInit) => new Promise<Response>((_, rej) => init.signal!.addEventListener("abort", () => rej(Object.assign(new Error("aborted"), { name: "AbortError" }))));
  const p = new GeminiProvider("k", "m", "gemini_paid", hang, 0);
  const r = await p.generateJson({ system: "s", user: "u", schema: {}, timeoutMs: 50 });
  assert.equal(r.ok, false); if (!r.ok) assert.equal(r.errorClass, "timeout");
});
test("safety block / empty candidate → blocked or invalid_response", async () => {
  const p = new GeminiProvider("k", "m", "gemini_paid", mockFetch([() => new Response(JSON.stringify({ promptFeedback: { blockReason: "SAFETY" } }), { status: 200 })]));
  const r = await p.generateJson({ system: "s", user: "u", schema: {} });
  assert.equal(r.ok, false); if (!r.ok) assert.equal(r.errorClass, "blocked");
});
test("Ollama without base URL → configuration error; env selects provider", async () => {
  const r = await new OllamaProvider(undefined, "m").generateJson({ system: "s", user: "u", schema: {} });
  assert.equal(r.ok, false); if (!r.ok) assert.equal(r.errorClass, "config");
  assert.equal(providerFromEnv((k) => ({ AI_PROVIDER: "ollama" } as Record<string, string>)[k]).name, "local_ollama");
  assert.equal(providerFromEnv((k) => ({ AI_PROVIDER_POLICY: "gemini_paid" } as Record<string, string>)[k]).name, "gemini_paid");
  assert.equal(providerFromEnv(() => undefined).name, "gemini_free", "free tier is assumed unless the paid tier is declared");
  assert.equal(providerFromEnv(() => undefined).model, "gemini-flash-latest");
});

test("free-tier quota: long RetryInfo delay is reported (not waited); daily quota says 'tomorrow'", async () => {
  const quota = (message: string, delay: string) => () => new Response(JSON.stringify({ error: { code: 429, message,
    details: [{ "@type": "type.googleapis.com/google.rpc.RetryInfo", retryDelay: delay }] } }), { status: 429 });
  const calls: Call[] = [];
  const p1 = new GeminiProvider("k", "m", "gemini_free", mockFetch([quota("Quota exceeded for metric generate_content_free_tier_requests, limit: 10", "37s")], calls), 2);
  const r1 = await p1.generateJson({ system: "s", user: "u", schema: {} });
  assert.equal(r1.ok, false); if (!r1.ok) { assert.equal(r1.errorClass, "rate_limit"); assert.match(r1.message, /about 37 seconds/); }
  assert.equal(calls.length, 1, "no retry when Google asks for a long wait");
  const p2 = new GeminiProvider("k", "m", "gemini_free", mockFetch([quota("Quota exceeded: GenerateRequestsPerDayPerProjectPerModel-FreeTier", "3s")]), 2);
  const r2 = await p2.generateJson({ system: "s", user: "u", schema: {} });
  assert.equal(r2.ok, false); if (!r2.ok) assert.match(r2.message, /tomorrow/);
});
