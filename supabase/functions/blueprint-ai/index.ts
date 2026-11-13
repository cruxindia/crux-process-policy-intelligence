// blueprint-ai — Supabase Edge Function (Deno). Company Operating Blueprint synthesis (PPI-032).
//   {action:"synthesise", company_id}  blueprint managers only; runs in the background and returns at once.
// Reads leadership answers and employee interview statements (names redacted), asks the AI for PROPOSED entries, CTQs without
// targets and open questions, validates them deterministically and stores them for a person to confirm. Logs hold metadata only.
import { createClient } from "npm:@supabase/supabase-js@2.118.0";
import { GeminiProvider, OllamaProvider, providerFromEnv, type AiProvider } from "../_shared/ai-provider.ts";
import { BLUEPRINT_PROMPT_KEY, BLUEPRINT_SCHEMA, BLUEPRINT_SYSTEM, buildBlueprintMessage, buildBlueprintSources, validateProposal,
  type LeaderAnswer } from "../_shared/blueprint.ts";
import { nameTokens, redactNames } from "../_shared/names.ts";
import { cooldownFor, rankConnections, type Conn } from "../_shared/routing.ts";

const ALLOWED = (Deno.env.get("ALLOWED_ORIGINS") ?? "https://crux-ppi.netlify.app,http://localhost:3000").split(",");
const cors = (o: string | null) => ({ "access-control-allow-origin": o && ALLOWED.includes(o) ? o : ALLOWED[0]!,
  "access-control-allow-headers": "authorization, x-client-info, apikey, content-type", "access-control-allow-methods": "POST, OPTIONS", vary: "origin" });
function apiKey(dictVar: string, legacy: string) {
  try { const o = JSON.parse(Deno.env.get(dictVar) ?? ""); const k = o.default ?? Object.values(o)[0]; if (typeof k === "string" && k) return k; } catch { /* unset */ }
  return Deno.env.get(legacy) ?? "";
}
const log = (event: string, d: Record<string, unknown>) => console.log(JSON.stringify({ fn: "blueprint-ai", event, ...d }));
// deno-lint-ignore no-explicit-any
type Db = any;
// deno-lint-ignore no-explicit-any
declare const EdgeRuntime: { waitUntil(p: Promise<any>): void } | undefined;
const sha256Hex = async (s: string) => [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)))].map((x) => x.toString(16).padStart(2, "0")).join("");

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "content-type": "application/json", ...cors(origin) } });
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(origin) });
  if (req.method !== "POST") return json({ ok: false, error: { message: "POST only" } }, 405);
  const url = Deno.env.get("SUPABASE_URL")!;
  const auth = req.headers.get("authorization") ?? "";
  const userDb = createClient(url, apiKey("SUPABASE_PUBLISHABLE_KEYS", "SUPABASE_ANON_KEY"), { global: { headers: { Authorization: auth } }, auth: { persistSession: false } });
  const svc = createClient(url, apiKey("SUPABASE_SECRET_KEYS", "SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });
  const { data: u } = await userDb.auth.getUser(auth.replace(/^Bearer\s+/i, ""));
  if (!u?.user) return json({ ok: false, error: { message: "Sign in again." } }, 401);
  let body: { action?: string; company_id?: string } = {};
  try { body = await req.json(); } catch { /* empty */ }
  if (body.action !== "synthesise" || !body.company_id) return json({ ok: false, error: { message: "Unknown action" } }, 400);
  const co = body.company_id;
  const { data: rights } = await userDb.rpc("blueprint_my_rights", { p_company: co });
  if (!rights?.manage) return json({ ok: false, error: { message: "Only blueprint managers can run the synthesis." } }, 403);
  const { data: me } = await userDb.from("memberships").select("id").eq("company_id", co).eq("user_id", u.user.id).eq("status", "active").maybeSingle();
  if (!me) return json({ ok: false, error: { message: "Not a member." } }, 403);

  // A run left "running" for over 10 minutes crashed: close it so a new one can start.
  await svc.from("blueprint_syntheses").update({ status: "failed", error_text: "Stopped unexpectedly", finished_at: new Date().toISOString() })
    .eq("company_id", co).eq("status", "running").lt("started_at", new Date(Date.now() - 10 * 60_000).toISOString());
  const { data: run, error } = await svc.from("blueprint_syntheses").insert({ company_id: co, requested_by: me.id }).select("id").single();
  if (error) return json({ ok: true, status: "running", note: error.code === "23505" ? "A synthesis is already running." : "Could not start." });
  const work = synthesise(svc, co, run.id, me.id).catch(async (e) => {
    log("crash", { message: String((e as Error)?.message ?? e).slice(0, 200) });
    await svc.from("blueprint_syntheses").update({ status: "failed", error_text: "The synthesis stopped unexpectedly; run it again.", finished_at: new Date().toISOString() })
      .eq("company_id", co).eq("id", run.id);
  });
  if (typeof EdgeRuntime !== "undefined") EdgeRuntime.waitUntil(work); else await work;
  return json({ ok: true, status: "running", synthesis_id: run.id });
});

async function candidates(svc: Db, co: string, sticky: string): Promise<{ provider: AiProvider; connectionId: string | null }[]> {
  const [{ data: cs }, { data: as }] = await Promise.all([
    svc.from("ai_provider_connections").select("id, name, provider, policy_provider, model, base_url, priority, status, cooldown_until, vault_secret_id").eq("company_id", co),
    svc.from("ai_connection_assignments").select("connection_id, department_id, process_id, interview_category, active").eq("company_id", co),
  ]);
  const conns: Conn[] = (cs ?? []).map((c: any) => ({ ...c, has_key: !!c.vault_secret_id, assignments: (as ?? []).filter((a: any) => a.connection_id === c.id) }));
  const list: { provider: AiProvider; connectionId: string | null }[] = [];
  for (const c of rankConnections(conns, { departmentId: null, processId: null, category: "team:pmo", stickyKey: sticky })) {
    if (list.length >= 3) break;
    if (c.provider === "ollama") { if (c.base_url) list.push({ provider: new OllamaProvider(c.base_url, c.model), connectionId: c.id }); continue; }
    const { data: key } = await svc.rpc("ai_connection_get_key", { p_company: co, p_connection: c.id });
    if (key) list.push({ provider: new GeminiProvider(String(key), c.model, c.policy_provider), connectionId: c.id });
  }
  const def = providerFromEnv((k) => Deno.env.get(k));
  if (!(def instanceof GeminiProvider) || Deno.env.get("GEMINI_API_KEY")) list.push({ provider: def, connectionId: null });
  return list;
}

async function synthesise(svc: Db, co: string, runId: string, requester: string) {
  const finish = (patch: Record<string, unknown>) => svc.from("blueprint_syntheses").update({ ...patch, finished_at: new Date().toISOString() }).eq("company_id", co).eq("id", runId);
  const { data: pv } = await svc.from("prompt_versions").select("id, template_sha256").eq("company_id", co).eq("prompt_key", BLUEPRINT_PROMPT_KEY)
    .eq("status", "active").order("version", { ascending: false }).limit(1).maybeSingle();
  if (!pv || pv.template_sha256 !== await sha256Hex(BLUEPRINT_SYSTEM + JSON.stringify(BLUEPRINT_SCHEMA)))
    return finish({ status: "failed", error_text: "The blueprint rules are not registered for this company (prompt version mismatch)." });

  // Leadership answers, per leader, in question order.
  const { data: camps } = await svc.from("interview_campaigns").select("id").eq("company_id", co).eq("purpose_kind", "leadership");
  const campIds = (camps ?? []).map((c: any) => c.id);
  const { data: asg } = campIds.length ? await svc.from("interview_assignments").select("id, respondent_membership_id").eq("company_id", co).in("campaign_id", campIds) : { data: [] };
  const { data: sess } = (asg ?? []).length ? await svc.from("interview_sessions").select("id, assignment_id").eq("company_id", co).in("assignment_id", (asg ?? []).map((a: any) => a.id)) : { data: [] };
  const leaderSessions = (sess ?? []).map((s: any) => s.id);
  const [{ data: qs }, { data: ans }] = leaderSessions.length ? await Promise.all([
    svc.from("interview_questions").select("id, session_id, seq, field_key, question_text").eq("company_id", co).in("session_id", leaderSessions).order("seq"),
    svc.from("interview_current_answers").select("question_id, answer_kind, answer_text").eq("company_id", co).in("question_id",
      (await svc.from("interview_questions").select("id").eq("company_id", co).in("session_id", leaderSessions)).data?.map((q: any) => q.id) ?? []),
  ]) : [{ data: [] }, { data: [] }];
  const ansBy = new Map((ans ?? []).map((a: any) => [a.question_id, a]));

  // Names are never sent: every member's name (all leading parts) is replaced by "the interviewee".
  const { data: ms } = await svc.from("memberships").select("user_id").eq("company_id", co);
  const { data: ups } = (ms ?? []).length ? await svc.from("user_profiles").select("display_name").in("id", (ms ?? []).map((m: any) => m.user_id)) : { data: [] };
  const names = nameTokens((ups ?? []).map((x: any) => x.display_name));
  const red = (t: string | null) => redactNames(t, names) ?? "";

  const leaders: LeaderAnswer[][] = leaderSessions.map((sid: string) => (qs ?? []).filter((q: any) => q.session_id === sid && ansBy.has(q.id)).map((q: any) => {
    const a: any = ansBy.get(q.id);
    return { section: String(q.field_key).replace(/^blueprint\./, "").replace(/^ai\./, "follow-up"), question: q.question_text, answer: red(a.answer_text),
      kind: a.answer_kind, meta: { kind: "leadership", session_id: sid, question_id: q.id } };
  })).filter((l: LeaderAnswer[]) => l.length);

  // Voice of the employee: statements extracted from the other interviews (newest first).
  const { data: an } = await svc.from("interview_answer_analyses").select("session_id, analysis").eq("company_id", co).order("created_at", { ascending: false }).limit(400);
  const seen = new Set<string>(); const employee: { text: string; meta: Record<string, unknown> }[] = [];
  for (const a of an ?? []) {
    if (leaderSessions.includes(a.session_id)) continue;
    for (const f of [...((a.analysis?.identified_facts ?? []) as string[]), ...((a.analysis?.potential_risks ?? []) as string[])]) {
      const t = red(String(f)).trim(); const k = t.toLowerCase();
      if (t.length < 8 || seen.has(k)) continue;
      seen.add(k); employee.push({ text: t, meta: { kind: "employee", session_id: a.session_id } });
    }
  }
  if (!leaders.length && !employee.length) return finish({ status: "failed", error_text: "Nothing to work from yet: no leadership answers and no interview statements." });
  const sources = buildBlueprintSources(leaders, employee.slice(0, 150));
  const metaBy = new Map(sources.map((s) => [s.ref, s.meta ?? {}]));

  const [{ data: ent }, { data: ctq }, { data: oq }] = await Promise.all([
    svc.from("blueprint_entries").select("section, statement, status").eq("company_id", co).in("status", ["confirmed", "proposed"]),
    svc.from("ctq_items").select("name").eq("company_id", co),
    svc.from("blueprint_open_questions").select("question").eq("company_id", co).eq("status", "open"),
  ]);
  const agreed = (ent ?? []).filter((e: any) => e.status === "confirmed");
  const userMsg = buildBlueprintMessage(sources, agreed, (oq ?? []).map((q: any) => q.question), (ctq ?? []).map((c: any) => c.name));

  let lastErr = "the AI could not complete the synthesis";
  for (const cand of await candidates(svc, co, runId)) {
    const key = `blueprint:${runId}:${cand.connectionId ?? "default"}`;
    const { data: air, error: airErr } = await svc.from("ai_runs").insert({ company_id: co, capability: "blueprint_synthesis", provider: cand.provider.name,
      model: cand.provider.model, prompt_version_id: pv.id, connection_id: cand.connectionId, data_classification: "confidential",
      requested_by_membership_id: requester, input_sha256: await sha256Hex(BLUEPRINT_SYSTEM + userMsg), status: "running", idempotency_key: key }).select("id").single();
    if (airErr) { lastErr = /PPI_AI_POLICY/.test(airErr.message ?? "") ? "This AI connection is not approved for confidential data." : "Could not record the AI run."; continue; }
    let note = ""; let done = false;
    for (let attempt = 0; attempt < 2 && !done; attempt++) {
      const r = await cand.provider.generateJson({ system: BLUEPRINT_SYSTEM, user: userMsg + note, schema: BLUEPRINT_SCHEMA, timeoutMs: 60_000, temperature: 0.2, maxOutputTokens: 12_000 });
      if (!r.ok) {
        lastErr = r.message; log("provider_error", { connection: cand.connectionId, errorClass: r.errorClass, status: r.status, detail: r.detail });
        if (r.errorClass === "rate_limit" && cand.connectionId) {
          const cd = cooldownFor("rate_limit", r.message);
          await svc.from("ai_provider_connections").update({ health: "rate_limited", last_error_class: "rate_limit", last_error_at: new Date().toISOString(),
            ...(cd ? { cooldown_until: cd.toISOString() } : {}) }).eq("company_id", co).eq("id", cand.connectionId);
        }
        if (r.errorClass === "timeout" && attempt === 0) continue;
        break;
      }
      const v = validateProposal(r.text, sources.map((s) => s.ref), { statements: (ent ?? []).map((e: any) => e.statement), ctqNames: (ctq ?? []).map((c: any) => c.name),
        openQs: (oq ?? []).map((q: any) => q.question) });
      if (!v.ok) { lastErr = v.error; note = `\n\nYour previous output was rejected: ${v.error}. Return valid JSON matching the schema.`; continue; }
      const p = v.proposal; const refs = (rs: string[]) => rs.map((ref) => ({ ref, ...metaBy.get(ref) }));
      if (p.entries.length) await svc.from("blueprint_entries").insert(p.entries.map((e) => ({ company_id: co, section: e.section, statement: e.statement,
        source_kind: "ai_synthesis", source_refs: refs(e.source_refs), ai_run_id: air.id, synthesis_id: runId })));
      if (p.ctqs.length) {
        const { data: last } = await svc.from("ctq_items").select("code").eq("company_id", co).order("code", { ascending: false }).limit(1);
        let n = last?.[0] ? Number(String(last[0].code).slice(4)) : 0;
        await svc.from("ctq_items").insert(p.ctqs.map((c) => ({ company_id: co, code: `CTQ-${String(++n).padStart(2, "0")}`, name: c.name, voice: c.voice,
          expectation: c.expectation, measure: c.measure, unit: c.unit, direction: c.direction, source_kind: "ai_synthesis", source_refs: refs(c.source_refs),
          ai_run_id: air.id, synthesis_id: runId })));
      }
      if (p.open_questions.length) await svc.from("blueprint_open_questions").insert(p.open_questions.map((q) => ({ company_id: co, section: q.section,
        question: q.question, synthesis_id: runId })));
      await svc.from("ai_runs").update({ status: "succeeded", finished_at: new Date().toISOString(), schema_valid: true, output_sha256: await sha256Hex(r.text),
        invalid_source_ref_count: v.dropped.uncited }).eq("company_id", co).eq("id", air.id);
      if (cand.connectionId) await svc.from("ai_provider_connections").update({ health: "connected", last_success_at: new Date().toISOString(), cooldown_until: null })
        .eq("company_id", co).eq("id", cand.connectionId);
      log("ok", { entries: p.entries.length, ctqs: p.ctqs.length, questions: p.open_questions.length, dropped: v.dropped, leaders: leaders.length, employee: employee.length });
      await finish({ status: "succeeded", counts: { entries: p.entries.length, ctqs: p.ctqs.length, questions: p.open_questions.length, dropped: v.dropped,
        leaders: leaders.length, employee_statements: Math.min(employee.length, 150) } });
      done = true;
    }
    if (done) return;
    await svc.from("ai_runs").update({ status: "failed", error_text: lastErr.slice(0, 200), finished_at: new Date().toISOString(), schema_valid: false,
      idempotency_key: `${key}:failed:${air.id}` }).eq("company_id", co).eq("id", air.id);
  }
  await finish({ status: "failed", error_text: `Paused: ${lastErr}. Everything already agreed is unchanged; run it again later.` });
}
