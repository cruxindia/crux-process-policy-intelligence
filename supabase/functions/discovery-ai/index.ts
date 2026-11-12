// discovery-ai — Supabase Edge Function (Deno). Master Corrective Prompt v2.0.
//   {action:"turn", session_id}                 AI-led discovery turn (opener, analysis, inventory, live flowchart, next question)
//   {action:"test", company_id, connection_id?} admin: real request through a connection (or the server default key)
//   {action:"save_key", company_id, connection_id, key}  admin: store a key in Supabase Vault, then test it
// Keys never leave the server; logs hold metadata only (no answers, no keys).
import { createClient } from "npm:@supabase/supabase-js@2.118.0";
import { GeminiProvider, OllamaProvider, providerFromEnv, type AiProvider } from "../_shared/ai-provider.ts";
import {
  PROMPT_KEY_V2, SYSTEM_PROMPT_V2, TURN_SCHEMA_V2, blockingClarifications, buildUserMessageV2, decideCompletionV2, dedupeContradictions,
  isRepeatV2, isRepeatedClarification, similarity, INVENTORY_NUDGE, needsInventoryNudge, mergeProcess, mergeResponsibilities, openingQuestion, progressV2, sha256Hex, validateTurnV2,
  type ContextV2, type Flow, type KnownProcess, type Stage,
} from "../_shared/discovery.ts";
import { cooldownFor, healthFor, HEALTH_LABEL, rankConnections, savedMessage, type Conn } from "../_shared/routing.ts";

const ALLOWED = (Deno.env.get("ALLOWED_ORIGINS") ?? "https://crux-ppi.netlify.app,http://localhost:3000").split(",");
const cors = (o: string | null) => ({ "access-control-allow-origin": o && ALLOWED.includes(o) ? o : ALLOWED[0]!,
  "access-control-allow-headers": "authorization, x-client-info, apikey, content-type", "access-control-allow-methods": "POST, OPTIONS", vary: "origin" });
const KIND: Record<string, string> = { unknown: "I don't know", not_applicable: "Not applicable to my work", refer_to_owner: "Someone else knows", depends: "It depends" };
function apiKey(dictVar: string, legacy: string) {
  try { const o = JSON.parse(Deno.env.get(dictVar) ?? ""); const k = o.default ?? Object.values(o)[0]; if (typeof k === "string" && k) return k; } catch { /* unset */ }
  return Deno.env.get(legacy) ?? "";
}
const log = (event: string, d: Record<string, unknown>) => console.log(JSON.stringify({ fn: "discovery-ai", event, ...d }));
const fail = (cls: string, message: string, extra: Record<string, unknown> = {}) => ({ ok: false, error: { class: cls, message, ...extra } });
// deno-lint-ignore no-explicit-any
type Db = any;

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "content-type": "application/json", ...cors(origin) } });
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(origin) });
  if (req.method !== "POST") return json(fail("bad_request", "POST only"), 405);
  const url = Deno.env.get("SUPABASE_URL")!;
  const auth = req.headers.get("authorization") ?? "";
  const userDb = createClient(url, apiKey("SUPABASE_PUBLISHABLE_KEYS", "SUPABASE_ANON_KEY"), { global: { headers: { Authorization: auth } }, auth: { persistSession: false } });
  const svc = createClient(url, apiKey("SUPABASE_SECRET_KEYS", "SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });
  const { data: u } = await userDb.auth.getUser(auth.replace(/^Bearer\s+/i, ""));
  if (!u?.user) return json(fail("auth", "Sign in again."), 401);
  let body: { action?: string; session_id?: string; company_id?: string; connection_id?: string; key?: string } = {};
  try { body = await req.json(); } catch { /* empty */ }

  if (body.action === "turn" && body.session_id) return json(await turn(userDb, svc, u.user.id, body.session_id));
  if ((body.action === "test" || body.action === "save_key") && body.company_id) {
    const { data: perms } = await userDb.rpc("my_permissions", { p_company: body.company_id });
    const list: string[] = Array.isArray(perms) ? perms.map((x: unknown) => typeof x === "string" ? x : String(Object.values(x as object)[0])) : [];
    const admin = list.includes("org.manage");
    if (!admin && !(body.action === "test" && !body.connection_id && list.includes("interview.manage")))
      return json(fail("forbidden", "Only administrators can manage AI connections."), 403);
    if (body.action === "save_key") {
      if (!body.connection_id || !body.key) return json(fail("bad_request", "connection and key required"), 400);
      const { error } = await svc.rpc("ai_connection_set_key", { p_company: body.company_id, p_connection: body.connection_id, p_key: body.key.trim() });
      if (error) { log("save_key_failed", { code: error.code }); return json(fail("bad_request", (error.message ?? "").replace(/^PPI_\w+: /, "") || "Could not store the key.")); }
      log("save_key_ok", { connection: body.connection_id });
    }
    return json(await testConnection(svc, body.company_id, body.connection_id ?? null));
  }
  return json(fail("bad_request", "Unknown action"), 400);
});

// ---------------- providers ----------------
type Candidate = { provider: AiProvider; connectionId: string | null; label: string };
async function loadConnections(svc: Db, co: string): Promise<(Conn & { vault_secret_id: string | null })[]> {
  const [{ data: cs }, { data: as }] = await Promise.all([
    svc.from("ai_provider_connections").select("id, name, provider, policy_provider, model, base_url, priority, status, cooldown_until, vault_secret_id").eq("company_id", co),
    svc.from("ai_connection_assignments").select("connection_id, department_id, process_id, interview_category, active").eq("company_id", co),
  ]);
  return (cs ?? []).map((c: any) => ({ ...c, has_key: !!c.vault_secret_id, assignments: (as ?? []).filter((a: any) => a.connection_id === c.id) }));
}
async function providerFor(svc: Db, co: string, c: Conn): Promise<AiProvider | null> {
  if (c.provider === "ollama") return c.base_url ? new OllamaProvider(c.base_url, c.model) : null;
  const { data: key } = await svc.rpc("ai_connection_get_key", { p_company: co, p_connection: c.id });
  return key ? new GeminiProvider(String(key), c.model, c.policy_provider) : null;
}
function envDefault(): Candidate | null {
  const p = providerFromEnv((k) => Deno.env.get(k));
  if (p instanceof GeminiProvider && !Deno.env.get("GEMINI_API_KEY")) return null;
  return { provider: p, connectionId: null, label: "Server default" };
}
async function markConnection(svc: Db, co: string, id: string | null, ok: boolean, errorClass?: string, status?: number, message?: string) {
  if (!id) return;
  const now = new Date();
  const cd = ok ? null : cooldownFor(errorClass ?? "", message ?? "", now);
  await svc.from("ai_provider_connections").update(ok
    ? { health: "connected", last_success_at: now.toISOString(), last_tested_at: now.toISOString(), cooldown_until: null }
    : { health: healthFor(false, errorClass, status), last_error_class: errorClass ?? "provider", last_error_at: now.toISOString(),
        last_tested_at: now.toISOString(), ...(cd ? { cooldown_until: cd.toISOString() } : {}) }).eq("company_id", co).eq("id", id);
  return cd;
}

async function testConnection(svc: Db, co: string, connectionId: string | null) {
  let cand: Candidate | null = null; let name = "Server default";
  if (connectionId) {
    const c = (await loadConnections(svc, co)).find((x) => x.id === connectionId);
    if (!c) return fail("not_found", "Connection not found.");
    name = c.name;
    const p = await providerFor(svc, co, c);
    if (!p) {
      await svc.from("ai_provider_connections").update({ health: "not_configured", last_tested_at: new Date().toISOString() }).eq("company_id", co).eq("id", c.id);
      return { ok: true, connected: false, health: "not_configured", label: HEALTH_LABEL.not_configured, name, model: c.model };
    }
    cand = { provider: p, connectionId: c.id, label: c.name };
  } else cand = envDefault();
  if (!cand) return { ok: true, connected: false, health: "not_configured", label: HEALTH_LABEL.not_configured, name, model: null };
  const r = await cand.provider.generateJson({ system: "Reply with JSON only.", user: 'Return {"ok": true}.',
    schema: { type: "object", properties: { ok: { type: "boolean" } }, required: ["ok"] }, timeoutMs: 20000, temperature: 0 });
  let valid = false; if (r.ok) { try { valid = JSON.parse(r.text).ok === true; } catch { valid = false; } }
  const health = r.ok ? (valid ? "connected" : "provider_error") : healthFor(false, r.errorClass, r.status);
  await markConnection(svc, co, cand.connectionId, r.ok && valid, r.ok ? "invalid_response" : r.errorClass, r.ok ? undefined : r.status, r.ok ? "" : r.message);
  log("test", { connection: cand.connectionId, health, ms: r.latencyMs });
  return { ok: true, connected: health === "connected", health, label: HEALTH_LABEL[health], name, provider: cand.provider.name,
    model: r.ok ? r.model : cand.provider.model, latency_ms: r.latencyMs, structured_output_valid: valid, message: r.ok ? null : r.message,
    checked_at: new Date().toISOString() };
}

// ---------------- discovery turn ----------------
async function turn(userDb: Db, svc: Db, uid: string, sessionId: string) {
  const { data: s } = await userDb.from("interview_sessions").select("id, company_id, status, interview_assignments(id, respondent_membership_id, department_id, process_id, campaign_id)")
    .eq("id", sessionId).maybeSingle();
  if (!s?.interview_assignments) return fail("not_found", "Interview not found.");
  const a = s.interview_assignments; const co = s.company_id;
  const { data: me } = await userDb.from("memberships").select("id, job_title, user_id").eq("company_id", co).eq("user_id", uid).eq("status", "active").maybeSingle();
  if (!me || me.id !== a.respondent_membership_id) return fail("forbidden", "Only the person being interviewed can continue this conversation.");
  if (!["in_progress", "reopened"].includes(s.status)) return fail("closed", "This conversation has been submitted.");

  const [{ data: camp }, { data: company }, { data: dept }, { data: person }, { data: qs }, { data: dp }, { data: procs }, { data: clar }, { data: pv }] = await Promise.all([
    svc.from("interview_campaigns").select("interview_mode, max_ai_questions, purpose").eq("company_id", co).eq("id", a.campaign_id).single(),
    svc.from("companies").select("name").eq("id", co).single(),
    svc.from("departments").select("code, name").eq("company_id", co).eq("id", a.department_id).maybeSingle(),
    svc.from("user_profiles").select("display_name").eq("id", uid).maybeSingle(),
    svc.from("interview_questions").select("id, seq, question_text, field_key, generated_by, rationale").eq("company_id", co).eq("session_id", sessionId).order("seq"),
    svc.from("discovery_profiles").select("*").eq("company_id", co).eq("session_id", sessionId).maybeSingle(),
    svc.from("discovered_processes").select("*").eq("company_id", co).eq("session_id", sessionId).order("created_at"),
    svc.from("interview_clarifications").select("id, description, earlier_answer_id, later_answer_id, question_id").eq("company_id", co).eq("session_id", sessionId).eq("status", "open"),
    svc.from("prompt_versions").select("id, template_sha256").eq("company_id", co).eq("prompt_key", PROMPT_KEY_V2).eq("status", "active").order("version", { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (camp?.interview_mode !== "discovery") return fail("config", "This conversation does not use the discovery engine.");
  if (!pv || pv.template_sha256 !== await sha256Hex(SYSTEM_PROMPT_V2 + JSON.stringify(TURN_SCHEMA_V2))) return fail("config", "The AI prompt version is not registered for this company.");
  const known: Record<string, string> = {};
  if (person?.display_name) known.name = person.display_name;
  if (me.job_title) known.designation = me.job_title;
  if (dept && dept.code !== "ALL") known.department = dept.name;

  // 1. Brand-new conversation: deterministic opener (no AI call needed).
  if (!(qs ?? []).length) {
    const o = openingQuestion(String(known.name ?? "").split(" ")[0] ?? "", known);
    const qid = crypto.randomUUID();
    await svc.from("interview_questions").insert({ id: qid, company_id: co, session_id: sessionId, seq: 1, field_key: "ai.person", question_text: o.text, rationale: o.reason, generated_by: "branch_rule" });
    await svc.from("discovery_profiles").upsert({ company_id: co, session_id: sessionId, membership_id: me.id, stage: "person" }, { onConflict: "company_id,session_id", ignoreDuplicates: true });
    return { ok: true, next_question: { id: qid, seq: 1, text: o.text, reason: o.reason, kind: "new_topic", generated_by: "branch_rule" }, ...state(dp, procs, known, false), progress: 0 };
  }
  const ids = qs.map((q: any) => q.id);
  const { data: ans } = await svc.from("interview_current_answers").select("id, question_id, answer_kind, answer_text, referred_note, revision_no").eq("company_id", co).in("question_id", ids);
  const ansBy = new Map((ans ?? []).map((x: any) => [x.question_id, x]));
  const pending = qs.find((q: any) => !ansBy.has(q.id));
  if (pending) return { ok: true, pending: true, next_question: shape(pending), ...state(dp, procs, known, false) };

  const answered = qs.filter((q: any) => ansBy.has(q.id));
  const latestQ = answered[answered.length - 1]; const latestA: any = ansBy.get(latestQ.id);
  const transcript = answered.map((q: any) => { const x: any = ansBy.get(q.id);
    const text = x.answer_kind === "answer" || x.answer_kind === "depends" ? (x.answer_text ?? "") : KIND[x.answer_kind] + (x.referred_note ? ` — ${x.referred_note}` : "");
    return { ref: `Q${q.seq}`, answerId: x.id, question: q.question_text, answer: text, edited: (x.revision_no ?? 1) > 1 }; });
  const profileVals: Record<string, string> = Object.fromEntries(Object.entries(dp?.profile ?? {}).map(([k, v]: [string, any]) => [k, String(v?.value ?? "")]));
  const knownProcs: KnownProcess[] = (procs ?? []).map((p: any) => ({ key: p.process_key, name: p.name, status: p.status, completeness: p.completeness, coverage: p.coverage ?? {}, flow: p.flow }));
  const aiAsked = qs.filter((q: any) => q.generated_by === "ai").length;
  const ctx: ContextV2 = {
    company: company?.name ?? "the company", campaignPurpose: camp.purpose, department: known.department ?? null, knownProfile: known, profile: profileVals,
    responsibilities: (dp?.responsibilities ?? []).map((r: any) => ({ name: r.name, kind: r.kind })), processes: knownProcs,
    stage: (dp?.stage ?? "person") as Stage, focusProcessKey: dp?.focus_process_key ?? null, inventoryConfirmed: !!dp?.inventory_confirmed,
    transcript, latestRef: `Q${latestQ.seq}`,
    openClarifications: (clar ?? []).map((c: any) => ({ id: c.id, description: c.description, already_asked: !!c.question_id && ansBy.has(c.question_id) })),
    aiQuestionsAsked: aiAsked, maxAiQuestions: camp.max_ai_questions,
  };
  const userMsg = buildUserMessageV2(ctx);
  const key = `dturn:${(await sha256Hex(transcript.map((t: any) => t.answerId).sort().join(","))).slice(0, 40)}`;

  // 2. Already analysed / waiting in the queue?
  const { data: prior } = await svc.from("ai_runs").select("id, status, created_at").eq("company_id", co).eq("idempotency_key", key).maybeSingle();
  if (prior?.status === "succeeded") return { ok: true, next_question: null, complete: true, complete_reason: "Conversation complete.", ...state(dp, procs, known, true) };
  if (prior?.status === "running") {
    if (Date.now() - Date.parse(prior.created_at) < 180_000) return fail("busy", "Still thinking about your last answer — one moment.");
    await svc.from("ai_runs").update({ status: "failed", error_text: "stale_running", finished_at: new Date().toISOString(), idempotency_key: `${key}:failed:${prior.id}` }).eq("company_id", co).eq("id", prior.id);
  }
  const { data: job } = await svc.from("ai_jobs").select("id, status, run_after, retry_count").eq("company_id", co).eq("idempotency_key", key).maybeSingle();
  if (job?.status === "queued" && Date.parse(job.run_after) > Date.now())
    return fail("queued", savedMessage(new Date(job.run_after)), { retry_at: job.run_after, ...state(dp, procs, known, false) });

  // 3. Candidates: department/process-assigned connections, shared pool, then the server default key.
  const conns = await loadConnections(svc, co);
  const ranked = rankConnections(conns, { departmentId: a.department_id ?? null, processId: a.process_id ?? null, category: "discovery" });
  const cands: Candidate[] = [];
  for (const c of ranked) { const p = await providerFor(svc, co, c); if (p) cands.push({ provider: p, connectionId: c.id, label: c.name }); }
  const def = envDefault(); if (def) cands.push(def);
  const cooling = conns.filter((c) => c.status === "active" && c.cooldown_until && Date.parse(c.cooldown_until) > Date.now()).map((c) => Date.parse(c.cooldown_until!));

  const asked = qs.map((q: any) => q.question_text);
  let lastErr: { class: string; message: string } | null = null; let earliest: number | null = cooling.length ? Math.min(...cooling) : null;
  for (const cand of cands.slice(0, 3)) {
    const { data: run, error: runErr } = await svc.from("ai_runs").insert({
      company_id: co, capability: "interview_followup", provider: cand.provider.name, model: cand.provider.model, prompt_version_id: pv.id, connection_id: cand.connectionId,
      data_classification: "internal", requested_by_membership_id: me.id, context_source_ids: transcript.map((t: any) => t.answerId),
      input_sha256: await sha256Hex(userMsg), status: "running", idempotency_key: key }).select("id").single();
    if (runErr) {
      if (runErr.code === "23505") return fail("busy", "Still thinking about your last answer — one moment.");
      log("run_rejected", { code: runErr.code, policy: /PPI_AI_POLICY/.test(runErr.message ?? ""), connection: cand.connectionId });
      lastErr = { class: "blocked", message: "This AI connection is not approved for this data." }; continue;
    }
    let note = ""; let result: any = null; let fallback: any = null; // fallback: schema-valid output that only failed a soft check
    for (let attempt = 0; attempt < 3 && !result; attempt++) {
      const r = await cand.provider.generateJson({ system: SYSTEM_PROMPT_V2, user: userMsg + note, schema: TURN_SCHEMA_V2, timeoutMs: 45000 });
      if (!r.ok) {
        lastErr = { class: r.errorClass, message: r.message };
        log("provider_error", { connection: cand.connectionId, errorClass: r.errorClass, status: r.status, ms: r.latencyMs, attempt, detail: r.detail });
        const cd = await markConnection(svc, co, cand.connectionId, false, r.errorClass, r.status, r.message);
        if (r.errorClass === "rate_limit") { const t = (cd ?? cooldownFor("rate_limit", r.message))!.getTime(); earliest = earliest ? Math.min(earliest, t) : t; }
        if (r.errorClass !== "invalid_response") break; continue;
      }
      const v = validateTurnV2(r.text, ctx);
      if (!v.ok) { log("invalid_output", { connection: cand.connectionId, errors: v.errors, attempt, schema_fallback: r.schemaFallback ?? null }); lastErr = { class: "invalid_response", message: "The AI answer was malformed." }; note = `\n\nYour previous output was rejected: ${v.errors.join("; ")}. Return valid JSON matching the schema.`; continue; }
      const refToAnswer = new Map(transcript.map((x: any) => [x.ref, x.answerId]));
      const newContra = dedupeContradictions(v.turn.contradictions, refToAnswer as Map<string, string>, clar ?? []);
      const candidate = { turn: v.turn, raw: r.text, model: r.model, ms: r.latencyMs, dropped: v.dropped.length, newContra, refToAnswer };
      const similar = asked.find((x: string) => similarity(x, v.turn.next_question.question) >= 0.7);
      if (isRepeatedClarification(v.turn.next_question.kind, ctx.openClarifications, newContra.length) || isRepeatV2(v.turn.next_question.question, v.turn.next_question.kind, asked)) {
        log("repeat_rejected", { connection: cand.connectionId, attempt });
        fallback = candidate;
        note = `\n\nYour next_question repeats an earlier question${similar ? ` ("${similar}")` : ""}. If the employee did not answer it, they probably chose to talk about something else: follow what they actually said instead, or move to a topic not yet covered. If the employee asked what you meant, use kind "rephrase".`; continue;
      }
      if (attempt === 0 && needsInventoryNudge(ctx, v.turn)) { log("inventory_nudge", { connection: cand.connectionId }); fallback = candidate; note = INVENTORY_NUDGE; continue; }
      if (r.schemaFallback) log("schema_fallback", { connection: cand.connectionId, detail: r.schemaFallback });
      result = candidate;
    }
    // A schema-valid turn that only failed a soft check (repeat / inventory nudge) beats showing the employee an error.
    if (!result && fallback) { log("soft_check_fallback", { connection: cand.connectionId }); result = fallback; }
    if (!result) {
      await svc.from("ai_runs").update({ status: "failed", error_text: lastErr?.class ?? "unknown", finished_at: new Date().toISOString(), schema_valid: false,
        idempotency_key: `${key}:failed:${run.id}` }).eq("company_id", co).eq("id", run.id);
      continue; // fallback to the next eligible connection
    }
    await markConnection(svc, co, cand.connectionId, true);
    const out = await persist(svc, co, sessionId, me.id, run.id, pv.id, latestQ, latestA, qs, ctx, dp, procs ?? [], known, result, aiAsked, camp.max_ai_questions);
    await svc.from("ai_runs").update({ status: "succeeded", finished_at: new Date().toISOString(), schema_valid: true, output_sha256: await sha256Hex(result.raw),
      invalid_source_ref_count: result.dropped }).eq("company_id", co).eq("id", run.id);
    if (job) await svc.from("ai_jobs").update({ status: "done", completed_at: new Date().toISOString(), connection_id: cand.connectionId }).eq("company_id", co).eq("id", job.id);
    log("turn_ok", { connection: cand.connectionId, model: result.model, ms: result.ms, stage: result.turn.stage, processes: out.processes.length, complete: out.complete });
    return { ok: true, ...out, model: result.model, served_by: cand.label };
  }

  // 4. Nothing could run: save the work in the queue and tell the employee honestly.
  const quota = lastErr?.class === "rate_limit" || (!cands.length && earliest);
  if (quota || !cands.length) {
    const runAfter = new Date(earliest ?? Date.now() + 10 * 60_000);
    await svc.from("ai_jobs").upsert({ company_id: co, membership_id: me.id, session_id: sessionId, task_type: "discovery_turn",
      payload_ref: { answer_id: latestA.id, fingerprint: key }, status: "queued", run_after: runAfter.toISOString(), idempotency_key: key,
      retry_count: (job?.retry_count ?? -1) + 1, error_class: lastErr?.class ?? "no_provider" }, { onConflict: "company_id,idempotency_key" });
    log("queued", { reason: lastErr?.class ?? "no_provider", run_after: runAfter.toISOString() });
    return fail("queued", savedMessage(runAfter), { retry_at: runAfter.toISOString(), ...state(dp, procs, known, false) });
  }
  return fail(lastErr?.class ?? "provider", "The assistant could not prepare the next question just now. Your answers are saved — please try again.", state(dp, procs, known, false));
}

async function persist(svc: Db, co: string, sessionId: string, membershipId: string, runId: string, pvId: string, latestQ: any, latestA: any, qs: any[],
  ctx: ContextV2, dp: any, procRows: any[], known: Record<string, string>, res: any, aiAsked: number, maxQ: number) {
  const t = res.turn; const now = new Date().toISOString();
  await svc.from("interview_answer_analyses").insert({ company_id: co, session_id: sessionId, answer_id: latestA.id, ai_run_id: runId,
    understood_answer: t.understood_answer, analysis: { ...t, next_question: undefined, flow: undefined } });
  // profile + responsibilities
  const profile = { ...(dp?.profile ?? {}) };
  for (const p of t.profile_updates) profile[p.field] = { value: p.value, source_ref: ctx.latestRef, updated_at: now };
  const responsibilities = mergeResponsibilities(dp?.responsibilities ?? [], t.responsibilities.map((r: any) => ({ ...r, source_ref: ctx.latestRef })));
  const focus = t.focus_process_key ?? t.next_question.process_key ?? dp?.focus_process_key ?? null;
  // processes
  const byKey = new Map(procRows.map((p: any) => [p.process_key, p]));
  const merged: KnownProcess[] = ctx.processes.map((p) => ({ ...p }));
  for (const u of t.process_updates) {
    const cur = merged.find((p) => p.key === u.key);
    const m = mergeProcess(cur, u);
    const row = byKey.get(u.key);
    const fields = { name: m.name, purpose: u.purpose ?? row?.purpose ?? null, involvement: u.involvement ?? row?.involvement ?? null, owner_text: u.owner ?? row?.owner_text ?? null,
      importance: u.importance ?? row?.importance ?? null, frequency: u.frequency ?? row?.frequency ?? null, volume: u.volume ?? row?.volume ?? null,
      departments: u.departments ?? row?.departments ?? [], status: m.status, completeness: m.completeness, coverage: m.coverage, last_ai_run_id: runId, updated_at: now };
    if (row) await svc.from("discovered_processes").update(fields).eq("company_id", co).eq("id", row.id);
    else {
      const id = crypto.randomUUID();
      const { error } = await svc.from("discovered_processes").insert({ id, company_id: co, session_id: sessionId, membership_id: membershipId, process_key: u.key, first_ai_run_id: runId, ...fields });
      if (!error) byKey.set(u.key, { id, process_key: u.key, flow_version: 0, ...fields }); else log("process_insert_failed", { code: error.code });
    }
    if (cur) Object.assign(cur, m); else merged.push(m);
  }
  // live flowchart for the process being discussed (versioned)
  if (t.flow) {
    const row = byKey.get(t.flow.process_key);
    const flow: Flow = { nodes: t.flow.nodes, edges: t.flow.edges };
    if (row && flow.nodes.length && JSON.stringify(flow) !== JSON.stringify(row.flow ?? {})) {
      const version = (row.flow_version ?? 0) + 1;
      await svc.from("discovered_processes").update({ flow, flow_version: version, last_ai_run_id: runId, updated_at: now,
        ...(row.status === "identified" ? { status: "in_discovery" } : {}) }).eq("company_id", co).eq("id", row.id);
      await svc.from("discovered_process_flows").insert({ company_id: co, process_id: row.id, version, flow, ai_run_id: runId });
      const mp = merged.find((p) => p.key === t.flow.process_key); if (mp) mp.flow = flow;
    }
  }
  const invConfirmed = !!dp?.inventory_confirmed || t.inventory_confirmed;
  await svc.from("discovery_profiles").upsert({ company_id: co, session_id: sessionId, membership_id: membershipId, profile, responsibilities,
    inventory_confirmed: invConfirmed, stage: t.stage, focus_process_key: focus, last_ai_run_id: runId, updated_at: now }, { onConflict: "company_id,session_id" });
  // clarifications
  for (const id of t.resolved_clarification_ids)
    await svc.from("interview_clarifications").update({ status: "resolved", resolved_by_ai_run_id: runId, resolution_note: "Resolved by later answer" }).eq("company_id", co).eq("id", id).eq("status", "open");
  const profVals = Object.fromEntries(Object.entries(profile).map(([k, v]: [string, any]) => [k, String(v?.value ?? "")]));
  const blocking = blockingClarifications(ctx.openClarifications, t.resolved_clarification_ids, res.newContra.length);
  const done = decideCompletionV2(profVals, known, invConfirmed, merged, blocking, t.completion_assessment.recommended_next_action, aiAsked + 1, maxQ);
  let next: any = null;
  if (!done.complete) {
    const seq = Math.max(...qs.map((q: any) => q.seq)) + 1; const qid = crypto.randomUUID();
    const pk = t.next_question.process_key ?? focus;
    const { error } = await svc.from("interview_questions").insert({ id: qid, company_id: co, session_id: sessionId, seq,
      field_key: pk ? `ai.process.${pk}` : `ai.${t.stage}`, question_text: t.next_question.question, rationale: t.next_question.reason || null,
      generated_by: "ai", ai_run_id: runId, prompt_version_id: pvId, parent_question_id: latestQ.id });
    if (error) throw new Error("question_insert_failed");
    next = { id: qid, seq, text: t.next_question.question, reason: t.next_question.reason, kind: t.next_question.kind, process_key: pk, generated_by: "ai" };
    const target = (await svc.from("interview_clarifications").select("id").eq("company_id", co).eq("session_id", sessionId).eq("status", "open").is("question_id", null).limit(1)).data?.[0];
    if (t.next_question.kind === "clarification" && !res.newContra.length && target)
      await svc.from("interview_clarifications").update({ question_id: qid }).eq("company_id", co).eq("id", target.id).is("question_id", null);
  }
  const clarifications: { description: string; question_id: string | null }[] = [];
  for (const c of res.newContra) {
    const qid = next && t.next_question.kind === "clarification" ? next.id : null;
    const { error } = await svc.from("interview_clarifications").insert({ company_id: co, session_id: sessionId, earlier_answer_id: res.refToAnswer.get(c.earlier_answer_ref),
      later_answer_id: res.refToAnswer.get(c.later_answer_ref), description: c.description, raised_by_ai_run_id: runId, question_id: qid });
    if (!error) clarifications.push({ description: c.description, question_id: qid });
  }
  const { data: freshProcs } = await svc.from("discovered_processes").select("*").eq("company_id", co).eq("session_id", sessionId).order("created_at");
  const { data: freshDp } = await svc.from("discovery_profiles").select("*").eq("company_id", co).eq("session_id", sessionId).maybeSingle();
  return { next_question: next, acknowledgement: t.acknowledgement || null, intent: t.intent, complete: done.complete, complete_reason: done.reason, clarifications,
    ...state(freshDp, freshProcs, known, false), progress: progressV2(profVals, known, invConfirmed, responsibilities.length, merged) };
}

/** What the browser needs to draw the side panel (profile, responsibilities, process inventory + flowcharts). */
function state(dp: any, procs: any[] | null, known: Record<string, string>, complete: boolean) {
  const profile = { ...Object.fromEntries(Object.entries(known).map(([k, v]) => [k, v])),
    ...Object.fromEntries(Object.entries(dp?.profile ?? {}).map(([k, v]: [string, any]) => [k, String(v?.value ?? "")])) };
  return { stage: dp?.stage ?? "person", focus_process_key: dp?.focus_process_key ?? null, inventory_confirmed: !!dp?.inventory_confirmed, profile,
    responsibilities: dp?.responsibilities ?? [], ...(complete ? { complete: true } : {}),
    processes: (procs ?? []).filter((p: any) => p.status !== "removed").map((p: any) => ({ id: p.id, key: p.process_key, name: p.name, status: p.status,
      completeness: p.completeness, coverage: p.coverage, flow: p.flow, flow_version: p.flow_version, involvement: p.involvement, frequency: p.frequency,
      departments: p.departments, purpose: p.purpose })) };
}
function shape(q: any) {
  return { id: q.id, seq: q.seq, text: q.question_text, reason: q.rationale ?? null, generated_by: q.generated_by,
    process_key: String(q.field_key).startsWith("ai.process.") ? String(q.field_key).slice(11) : null };
}
