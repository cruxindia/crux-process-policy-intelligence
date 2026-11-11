// interview-ai — Supabase Edge Function (Deno).
//   POST {action:"status"}                 → real provider request; reports connected / actual error. No company data sent.
//   POST {action:"turn", session_id}       → analyse the latest answer with full session context, store the analysis,
//                                            coverage and contradictions, and create the next adaptive question.
// The caller's JWT is verified; the caller must be the session's respondent. AI artefacts are written with the
// service identity (employees cannot write them). Secrets (GEMINI_API_KEY …) live only in the function's environment.
import { createClient } from "npm:@supabase/supabase-js@2.118.0";
import { providerFromEnv, type AiProvider } from "../_shared/ai-provider.ts";
import {
  DIMENSIONS, PROMPT_KEY, SYSTEM_PROMPT, TURN_SCHEMA, buildUserMessage, decideCompletion, isRepeat, mergeCoverage,
  progressPercent, sha256Hex, validateTurn, type CoverageStatus, type Context, type TranscriptItem,
} from "../_shared/engine.ts";

const ALLOWED = (Deno.env.get("ALLOWED_ORIGINS") ?? "https://crux-ppi.netlify.app,http://localhost:3000").split(",");
const cors = (origin: string | null) => ({
  "access-control-allow-origin": origin && ALLOWED.includes(origin) ? origin : ALLOWED[0]!,
  "access-control-allow-headers": "authorization, x-client-info, apikey, content-type",
  "access-control-allow-methods": "POST, OPTIONS", "vary": "origin",
});
const KIND: Record<string, string> = { unknown: "I don't know", not_applicable: "Not applicable to my work", refer_to_owner: "Someone else knows", depends: "It depends" };
/** New-style API keys (JSON dictionaries) with fallback to the legacy single keys. */
function apiKey(dictVar: string, legacyVar: string): string {
  try { const o = JSON.parse(Deno.env.get(dictVar) ?? ""); const k = o.default ?? Object.values(o)[0]; if (typeof k === "string" && k) return k; } catch { /* not set */ }
  return Deno.env.get(legacyVar) ?? "";
}
const log = (event: string, data: Record<string, unknown>) => console.log(JSON.stringify({ fn: "interview-ai", event, ...data })); // never content

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...cors(origin) } });
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(origin) });
  if (req.method !== "POST") return json({ ok: false, error: { class: "bad_request", message: "POST only" } }, 405);

  const url = Deno.env.get("SUPABASE_URL")!;
  const auth = req.headers.get("authorization") ?? "";
  const userDb = createClient(url, apiKey("SUPABASE_PUBLISHABLE_KEYS", "SUPABASE_ANON_KEY"), { global: { headers: { Authorization: auth } }, auth: { persistSession: false } });
  const svc = createClient(url, apiKey("SUPABASE_SECRET_KEYS", "SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });
  // Server-side client has no stored session: verify the caller's JWT explicitly.
  const { data: u, error: authErr } = await userDb.auth.getUser(auth.replace(/^Bearer\s+/i, ""));
  if (!u?.user) { log("auth_failed", { status: authErr?.status, code: authErr?.code }); return json({ ok: false, error: { class: "auth", message: "Sign in again." } }, 401); }

  let body: { action?: string; session_id?: string; company_id?: string } = {};
  try { body = await req.json(); } catch { /* empty */ }
  const provider = providerFromEnv((k) => Deno.env.get(k));

  if (body.action === "status") {
    // Connectivity check costs a real provider call: only administrators / discovery leads of a company may run it.
    if (!body.company_id) return json({ ok: false, error: { class: "bad_request", message: "company_id required" } }, 400);
    const { data: perms } = await userDb.rpc("my_permissions", { p_company: body.company_id });
    const list: string[] = Array.isArray(perms) ? perms.map((x: unknown) => typeof x === "string" ? x : Object.values(x as object)[0] as string) : [];
    if (!list.includes("org.manage") && !list.includes("interview.manage")) return json({ ok: false, error: { class: "forbidden", message: "Only administrators can run the AI connection check." } }, 403);
    return json(await status(provider));
  }
  if (body.action === "turn" && body.session_id) return json(await turn(provider, userDb, svc, u.user.id, body.session_id));
  return json({ ok: false, error: { class: "bad_request", message: "Unknown action" } }, 400);
});

async function status(p: AiProvider) {
  const r = await p.generateJson({
    system: "You are a connectivity check. Reply with JSON only.", user: 'Return {"ok": true}.',
    schema: { type: "object", properties: { ok: { type: "boolean" } }, required: ["ok"] }, timeoutMs: 20000, temperature: 0,
  });
  let ok = false;
  if (r.ok) { try { ok = JSON.parse(r.text).ok === true; } catch { ok = false; } }
  log("status", { provider: p.name, model: p.model, ok, errorClass: r.ok ? undefined : r.errorClass, status: r.ok ? 200 : r.status, ms: r.latencyMs });
  return r.ok && ok
    ? { ok: true, connected: true, provider: p.name, model: r.model, latency_ms: r.latencyMs, checked_at: new Date().toISOString() }
    : { ok: true, connected: false, provider: p.name, model: p.model, checked_at: new Date().toISOString(),
        error: r.ok ? { class: "invalid_response", message: "The provider answered but not with the expected JSON" } : { class: r.errorClass, message: r.message } };
}

// deno-lint-ignore no-explicit-any
type Db = any;
async function turn(provider: AiProvider, userDb: Db, svc: Db, uid: string, sessionId: string) {
  // 1. Authorisation with the caller's own token (RLS): must read the session and be its respondent.
  const { data: s } = await userDb.from("interview_sessions")
    .select("id, company_id, status, assignment_id, interview_assignments(id, respondent_membership_id, department_id, campaign_id)")
    .eq("id", sessionId).maybeSingle();
  if (!s?.interview_assignments) return fail("not_found", "Interview not found.");
  const a = s.interview_assignments;
  const { data: me } = await userDb.from("memberships").select("id").eq("company_id", s.company_id).eq("user_id", uid).eq("status", "active").maybeSingle();
  if (!me || me.id !== a.respondent_membership_id) return fail("forbidden", "Only the person being interviewed can continue this interview.");
  if (!["in_progress", "reopened"].includes(s.status)) return fail("closed", "This interview has been submitted.");

  // 2. Context (service identity; scope = this session only).
  const co = s.company_id;
  const [{ data: camp }, { data: company }, { data: dept }, { data: qs }, { data: cov }, { data: clar }, { data: pv }] = await Promise.all([
    svc.from("interview_campaigns").select("interview_mode, ai_provider, max_ai_questions, purpose").eq("company_id", co).eq("id", a.campaign_id).single(),
    svc.from("companies").select("name").eq("id", co).single(),
    svc.from("departments").select("name").eq("company_id", co).eq("id", a.department_id).maybeSingle(),
    svc.from("interview_questions").select("id, seq, question_text, field_key, generated_by, rationale").eq("company_id", co).eq("session_id", sessionId).order("seq"),
    svc.from("interview_dimension_coverage").select("dimension, status").eq("company_id", co).eq("session_id", sessionId),
    svc.from("interview_clarifications").select("id, description").eq("company_id", co).eq("session_id", sessionId).eq("status", "open"),
    svc.from("prompt_versions").select("id, template_sha256").eq("company_id", co).eq("prompt_key", PROMPT_KEY).eq("status", "active").order("version", { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (camp?.interview_mode !== "adaptive") return fail("config", "This interview does not use the adaptive AI engine.");
  const promptHash = await sha256Hex(SYSTEM_PROMPT + JSON.stringify(TURN_SCHEMA));
  if (!pv || pv.template_sha256 !== promptHash) return fail("config", "The AI prompt version is not registered for this company.");
  if (camp.ai_provider && camp.ai_provider !== provider.name) return fail("config", `Campaign expects provider ${camp.ai_provider}, server is configured for ${provider.name}.`);

  const ids = (qs ?? []).map((q: { id: string }) => q.id);
  const { data: ans } = await svc.from("interview_current_answers")
    .select("id, question_id, answer_kind, answer_text, referred_note, revision_no").eq("company_id", co).in("question_id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]);
  const ansBy = new Map((ans ?? []).map((x: { question_id: string }) => [x.question_id, x]));

  // 3. Anything still unanswered? Then there is nothing to generate (resume / double-submit safety).
  const pending = (qs ?? []).find((q: { id: string }) => !ansBy.has(q.id));
  if (pending) return { ok: true, pending: true, next_question: shape(pending) };
  const answered = (qs ?? []).filter((q: { id: string }) => ansBy.has(q.id));
  if (!answered.length) return fail("bad_request", "Answer the first question before the AI can continue.");
  const latestQ = answered[answered.length - 1];
  const latestA: any = ansBy.get(latestQ.id);

  const profile: Record<string, string> = {};
  const transcript: TranscriptItem[] = answered.map((q: any) => {
    const x: any = ansBy.get(q.id);
    const text = x.answer_kind === "answer" || x.answer_kind === "depends" ? (x.answer_text ?? "") : KIND[x.answer_kind] + (x.referred_note ? ` — ${x.referred_note}` : "");
    if (String(q.field_key).startsWith("self.")) profile[String(q.field_key).slice(5)] = text.slice(0, 300);
    return { ref: `Q${q.seq}`, answerId: x.id, question: q.question_text, answer: text, edited: (x.revision_no ?? 1) > 1 };
  });
  const coverage: Record<string, CoverageStatus> = Object.fromEntries((cov ?? []).map((c: any) => [c.dimension, c.status]));
  const aiAsked = (qs ?? []).filter((q: any) => q.generated_by === "ai").length;
  const ctx: Context = {
    company: company?.name ?? "the company", campaignPurpose: camp.purpose, department: dept?.name ?? null, profile, transcript,
    latestRef: `Q${latestQ.seq}`, coverage, openClarifications: (clar ?? []).map((c: any) => ({ id: c.id, description: c.description })),
    aiQuestionsAsked: aiAsked, maxAiQuestions: camp.max_ai_questions,
  };
  const userMsg = buildUserMessage(ctx);

  // 4. Idempotency key = fingerprint of the current answer set: an edit to ANY answer produces a new state and a new turn.
  const key = `turn:${(await sha256Hex(transcript.map((t) => t.answerId).sort().join(","))).slice(0, 40)}`;
  const profileQs = (qs ?? []).filter((q: any) => q.generated_by !== "ai"); // fixed opening questions (profile + company)
  const progressNow = (c: Record<string, CoverageStatus>) => progressPercent(profileQs.filter((q: any) => ansBy.has(q.id)).length, profileQs.length, c);
  const { data: prior } = await svc.from("ai_runs").select("id, status, created_at").eq("company_id", co).eq("idempotency_key", key).maybeSingle();
  if (prior?.status === "succeeded") {
    // This exact answer set was already analysed and no new question was needed → the interview is complete.
    return { ok: true, next_question: null, complete: true, complete_reason: "Interview complete.", coverage, progress: progressNow(coverage), clarifications: [] };
  }
  if (prior?.status === "running") {
    if (Date.now() - Date.parse(prior.created_at) < 180_000) return fail("busy", "Your previous answer is still being analysed. Please wait a moment.");
    await finishRun(svc, co, prior.id, "failed", "stale_running"); // crashed/timed-out worker: release the key
    await svc.from("ai_runs").update({ idempotency_key: `${key}:failed:${prior.id}` }).eq("company_id", co).eq("id", prior.id);
  }

  // 5. Record the AI run first (DB guard enforces provider policy + data classification + active prompt).
  const { data: run, error: runErr } = await svc.from("ai_runs").insert({
    company_id: co, capability: "interview_followup", provider: provider.name, model: provider.model, prompt_version_id: pv.id,
    data_classification: "internal", requested_by_membership_id: me.id, context_source_ids: transcript.map((t) => t.answerId),
    input_sha256: await sha256Hex(userMsg), status: "running", idempotency_key: key,
  }).select("id").single();
  if (runErr) {
    if (runErr.code === "23505") return fail("busy", "Your previous answer is still being analysed. Please wait a moment.");
    const m = /PPI_AI_POLICY: (.*)$/.exec(runErr.message ?? "");
    log("run_rejected", { reason: m ? "policy" : "db", code: runErr.code });
    return fail("blocked", m ? `AI is not allowed for this data: ${m[1]}` : "Could not start the AI analysis.");
  }

  // 6. Call the provider; validate; one corrective retry for invalid or repeated output.
  const asked = (qs ?? []).map((q: any) => q.question_text);
  let note = "";
  let lastError: { class: string; message: string } | null = null;
  const started = Date.now();
  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt > 0 && Date.now() - started > 60_000) break; // stay well inside the Edge Function wall-clock limit
    const r = await provider.generateJson({ system: SYSTEM_PROMPT, user: userMsg + note, schema: TURN_SCHEMA, timeoutMs: 40000 });
    if (!r.ok) {
      lastError = { class: r.errorClass, message: r.message };
      log("provider_error", { provider: provider.name, model: provider.model, errorClass: r.errorClass, status: r.status, ms: r.latencyMs, attempt });
      if (r.errorClass !== "invalid_response") break;
      continue;
    }
    const v = validateTurn(r.text, ctx);
    if (!v.ok) { lastError = { class: "invalid_response", message: "The AI returned an answer in the wrong format." }; note = `\n\nYour previous output was rejected: ${v.errors.join("; ")}. Return valid JSON matching the schema.`; log("invalid_output", { errors: v.errors.length, attempt }); continue; }
    const t = v.turn;
    if (isRepeat(t.next_question.question, t.next_question.kind, asked)) {
      lastError = { class: "invalid_response", message: "The AI repeated an earlier question." };
      note = `\n\nYour previous next_question repeated an earlier question. Ask about something not yet covered, or mark kind "clarification" and say exactly what is unclear.`;
      log("repeat_rejected", { attempt }); continue;
    }

    // 7. Persist results.
    const refToAnswer = new Map(transcript.map((x) => [x.ref, x.answerId!]));
    await svc.from("interview_answer_analyses").insert({ company_id: co, session_id: sessionId, answer_id: latestA.id, ai_run_id: run.id,
      understood_answer: t.understood_answer, analysis: { ...t, next_question: undefined } });
    const merged = mergeCoverage(coverage, t.coverage_updates);
    const covRows = Object.entries(merged).map(([dimension, status]) => ({ company_id: co, session_id: sessionId, dimension, status,
      note: t.coverage_updates.find((x) => x.dimension === dimension)?.note ?? null, ai_run_id: run.id, updated_at: new Date().toISOString() }));
    if (covRows.length) await svc.from("interview_dimension_coverage").upsert(covRows, { onConflict: "company_id,session_id,dimension" });
    for (const id of t.resolved_clarification_ids) {
      await svc.from("interview_clarifications").update({ status: "resolved", resolved_by_ai_run_id: run.id, resolution_note: "Resolved by later answer" })
        .eq("company_id", co).eq("id", id).eq("status", "open");
    }
    const stillOpen = ctx.openClarifications.length - t.resolved_clarification_ids.length + t.contradictions.length;
    const done = decideCompletion(merged, stillOpen, t.completion_assessment.recommended_next_action, aiAsked + 1, camp.max_ai_questions);

    let next: any = null;
    if (!done.complete) {
      const nextSeq = Math.max(...(qs ?? []).map((q: any) => q.seq)) + 1;
      const qid = crypto.randomUUID();
      const { error: qErr } = await svc.from("interview_questions").insert({ id: qid, company_id: co, session_id: sessionId, seq: nextSeq,
        field_key: `ai.${t.next_question.discovery_dimension}`, question_text: t.next_question.question,
        rationale: t.next_question.reason || null, generated_by: "ai", ai_run_id: run.id, prompt_version_id: pv.id, parent_question_id: latestQ.id });
      if (qErr) {
        log("question_insert_failed", { code: qErr.code });
        await finishRun(svc, co, run.id, "failed", "db_error");
        await svc.from("ai_runs").update({ idempotency_key: `${key}:failed:${run.id}` }).eq("company_id", co).eq("id", run.id);
        return fail("provider", "Could not save the next question. Please try again.");
      }
      next = { id: qid, seq: nextSeq, question_text: t.next_question.question, rationale: t.next_question.reason, field_key: `ai.${t.next_question.discovery_dimension}`, generated_by: "ai", kind: t.next_question.kind };
    }
    const clarifications: { description: string; question_id: string | null }[] = [];
    for (const c of t.contradictions) {
      const qid = next && t.next_question.kind === "clarification" ? next.id : null;
      const { error: cErr } = await svc.from("interview_clarifications").insert({ company_id: co, session_id: sessionId, earlier_answer_id: refToAnswer.get(c.earlier_answer_ref),
        later_answer_id: refToAnswer.get(c.later_answer_ref), description: c.description, raised_by_ai_run_id: run.id, question_id: qid });
      if (!cErr) clarifications.push({ description: c.description, question_id: qid });
      else log("clarification_insert_failed", { code: cErr.code });
    }
    await finishRun(svc, co, run.id, "succeeded", null, await sha256Hex(r.text), v.dropped.length);
    log("turn_ok", { provider: provider.name, model: r.model, ms: r.latencyMs, attempt, contradictions: t.contradictions.length, complete: done.complete });
    return { ok: true, next_question: next ? shape(next, t.next_question.kind) : null, complete: done.complete, complete_reason: done.reason,
      coverage: merged, progress: progressNow(merged), understood: t.understood_answer, clarifications,
      resolved: t.resolved_clarification_ids, model: r.model };
  }
  await finishRun(svc, co, run.id, "failed", lastError?.class ?? "unknown");
  // free the idempotency key so the employee can retry
  await svc.from("ai_runs").update({ idempotency_key: `${key}:failed:${run.id}` }).eq("company_id", co).eq("id", run.id);
  return fail(lastError?.class ?? "provider", lastError?.message ?? "The AI service is unavailable.");
}

async function finishRun(svc: Db, co: string, id: string, status: string, err: string | null, outHash?: string, invalidRefs?: number) {
  await svc.from("ai_runs").update({ status, error_text: err, finished_at: new Date().toISOString(), schema_valid: status === "succeeded",
    output_sha256: outHash ?? null, invalid_source_ref_count: invalidRefs ?? null }).eq("company_id", co).eq("id", id);
}
const fail = (cls: string, message: string) => ({ ok: false, error: { class: cls, message } });
function shape(q: any, kind?: string) {
  return { id: q.id, seq: q.seq, text: q.question_text, reason: q.rationale ?? null, dimension: String(q.field_key).startsWith("ai.") ? String(q.field_key).slice(3) : null,
           generated_by: q.generated_by, kind: kind ?? null };
}
export { DIMENSIONS };
