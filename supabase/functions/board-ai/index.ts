// board-ai — Supabase Edge Function (Deno). Expert review board (PPI-029).
//   {action:"run", case_id}  start/resume a case in the background; returns at once. Every turn is stored (append-only).
// The browser only reads results through RLS. Keys stay server-side; logs hold metadata only.
import { createClient } from "npm:@supabase/supabase-js@2.118.0";
import { GeminiProvider, OllamaProvider, providerFromEnv, type AiProvider } from "../_shared/ai-provider.ts";
import { BOARD_PROMPT_KEY, BOARD_SCHEMA, BOARD_SYSTEM, MAX_REVISIONS, buildPlan, buildSources, buildTurnMessage, lintDocument, preservationIssues, revisionSteps, validateTurn,
  type CaseKind, type DocType, type PriorTurn, type Step } from "../_shared/board.ts";
import { cooldownFor, rankConnections, type Conn } from "../_shared/routing.ts";

const ALLOWED = (Deno.env.get("ALLOWED_ORIGINS") ?? "https://crux-ppi.netlify.app,http://localhost:3000").split(",");
const cors = (o: string | null) => ({ "access-control-allow-origin": o && ALLOWED.includes(o) ? o : ALLOWED[0]!,
  "access-control-allow-headers": "authorization, x-client-info, apikey, content-type", "access-control-allow-methods": "POST, OPTIONS", vary: "origin" });
function apiKey(dictVar: string, legacy: string) {
  try { const o = JSON.parse(Deno.env.get(dictVar) ?? ""); const k = o.default ?? Object.values(o)[0]; if (typeof k === "string" && k) return k; } catch { /* unset */ }
  return Deno.env.get(legacy) ?? "";
}
const log = (event: string, d: Record<string, unknown>) => console.log(JSON.stringify({ fn: "board-ai", event, ...d }));
const BUDGET_MS = 95_000;             // start no new turn after this (platform wall clock is 150 s); a case resumes on the next "run" if it needs longer
// deno-lint-ignore no-explicit-any
type Db = any;
// deno-lint-ignore no-explicit-any
declare const EdgeRuntime: { waitUntil(p: Promise<any>): void } | undefined;

async function sha256Hex(s: string) {
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
}

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
  let body: { action?: string; case_id?: string } = {};
  try { body = await req.json(); } catch { /* empty */ }
  if (body.action !== "run" || !body.case_id) return json({ ok: false, error: { message: "Unknown action" } }, 400);

  // RLS decides whether this person may see (and therefore run) the case.
  const { data: c } = await userDb.from("board_cases").select("id, company_id, status").eq("id", body.case_id).maybeSingle();
  if (!c) return json({ ok: false, error: { message: "Case not found." } }, 404);
  if (!["queued", "waiting", "running"].includes(c.status)) return json({ ok: true, status: c.status });
  const { data: claimed } = await svc.from("board_cases").update({ run_lock_until: new Date(Date.now() + BUDGET_MS + 60_000).toISOString(), status: "running", last_error: null })
    .eq("company_id", c.company_id).eq("id", c.id).in("status", ["queued", "waiting", "running"])
    .or(`run_lock_until.is.null,run_lock_until.lt.${new Date().toISOString()}`).select("id");
  if (!claimed?.length) return json({ ok: true, status: "running", note: "already running" });
  const work = runCase(svc, c.company_id, c.id).catch(async (e) => {
    log("run_crash", { case: c.id, message: String((e as Error)?.message ?? e).slice(0, 200) });
    await svc.from("board_cases").update({ status: "waiting", last_error: "The board stopped unexpectedly; open the case again to resume.", run_lock_until: null })
      .eq("company_id", c.company_id).eq("id", c.id);
  });
  if (typeof EdgeRuntime !== "undefined") EdgeRuntime.waitUntil(work); else await work;
  return json({ ok: true, status: "running" });
});

type Role = { id: string; code: string; version: number; title: string; charter: string; charter_sha256: string; team_code: string };
type Cand = { provider: AiProvider; connectionId: string | null; label: string };

async function candidatesFor(svc: Db, co: string, team: string, caseId: string): Promise<{ list: Cand[]; restingUntil: number | null }> {
  const [{ data: cs }, { data: as }] = await Promise.all([
    svc.from("ai_provider_connections").select("id, name, provider, policy_provider, model, base_url, priority, status, cooldown_until, vault_secret_id").eq("company_id", co),
    svc.from("ai_connection_assignments").select("connection_id, department_id, process_id, interview_category, active").eq("company_id", co),
  ]);
  const conns: Conn[] = (cs ?? []).map((c: any) => ({ ...c, has_key: !!c.vault_secret_id, assignments: (as ?? []).filter((a: any) => a.connection_id === c.id) }));
  const ranked = rankConnections(conns, { departmentId: null, processId: null, category: `team:${team}`, stickyKey: caseId });
  const list: Cand[] = [];
  for (const c of ranked) {
    if (list.length >= 3) break;          // the sticky choice + two fallbacks; no need to unlock every key
    if (c.provider === "ollama") { if (c.base_url) list.push({ provider: new OllamaProvider(c.base_url, c.model), connectionId: c.id, label: c.name }); continue; }
    const { data: key } = await svc.rpc("ai_connection_get_key", { p_company: co, p_connection: c.id });
    if (key) list.push({ provider: new GeminiProvider(String(key), c.model, c.policy_provider), connectionId: c.id, label: c.name });
  }
  const def = providerFromEnv((k) => Deno.env.get(k));
  if (!(def instanceof GeminiProvider) || Deno.env.get("GEMINI_API_KEY")) list.push({ provider: def, connectionId: null, label: "Server default" });
  const resting = conns.filter((c) => c.status === "active" && c.cooldown_until && Date.parse(c.cooldown_until) > Date.now()).map((c) => Date.parse(c.cooldown_until!));
  return { list, restingUntil: resting.length ? Math.min(...resting) : null };
}

async function runCase(svc: Db, co: string, caseId: string) {
  const started = Date.now();
  const release = (patch: Record<string, unknown>) => svc.from("board_cases").update({ ...patch, run_lock_until: null }).eq("company_id", co).eq("id", caseId);
  const [{ data: cs }, { data: pv }, { data: roleRows }] = await Promise.all([
    svc.from("board_cases").select("*").eq("company_id", co).eq("id", caseId).single(),
    svc.from("prompt_versions").select("id, template_sha256").eq("company_id", co).eq("prompt_key", BOARD_PROMPT_KEY).eq("status", "active")
      .order("version", { ascending: false }).limit(1).maybeSingle(),
    svc.from("agent_roles").select("id, code, version, title, charter, charter_sha256, agent_teams(code)").eq("company_id", co).eq("status", "active"),
  ]);
  if (!pv || pv.template_sha256 !== await sha256Hex(BOARD_SYSTEM + JSON.stringify(BOARD_SCHEMA)))
    return release({ status: "failed", last_error: "The board's rules are not registered for this company (prompt version mismatch)." });
  const roles = new Map<string, Role>((roleRows ?? []).map((r: any) => [r.code, { ...r, team_code: r.agent_teams?.code ?? "?" }]));
  let plan: Step[] = Array.isArray(cs.plan) && cs.plan.length ? cs.plan : buildPlan(cs.kind as CaseKind, cs.doc_type as DocType | null);
  const missing = [...new Set(plan.map((s) => s.role))].filter((r) => !roles.has(r));
  if (missing.length) return release({ status: "failed", last_error: `Expert roles not configured: ${missing.join(", ")}` });
  if (!cs.plan) await svc.from("board_cases").update({ plan }).eq("company_id", co).eq("id", caseId);

  // Sources: the brief + each selected discovered process (facts only; employee names are never included).
  const { data: procs } = cs.source_process_ids.length
    ? await svc.from("discovered_processes").select("id, session_id, name, purpose, frequency, volume, involvement, owner_text, departments, flow, coverage")
        .eq("company_id", co).in("id", cs.source_process_ids)
    : { data: [] };
  const sessions = [...new Set((procs ?? []).map((p: any) => p.session_id))];
  const [{ data: profs }, { data: analyses }] = sessions.length ? await Promise.all([
    svc.from("discovery_profiles").select("session_id, profile").eq("company_id", co).in("session_id", sessions),
    svc.from("interview_answer_analyses").select("session_id, analysis").eq("company_id", co).in("session_id", sessions).limit(400),
  ]) : [{ data: [] }, { data: [] }];
  const factsBy = new Map<string, string[]>();
  for (const a of analyses ?? []) factsBy.set(a.session_id, [...(factsBy.get(a.session_id) ?? []), ...((a.analysis?.identified_facts ?? []) as string[])]);
  const roleBy = new Map((profs ?? []).map((p: any) => [p.session_id, [p.profile?.designation?.value, p.profile?.department?.value].filter(Boolean).join(", ") || null]));
  const sources = buildSources(cs.brief ?? "", (procs ?? []).map((p: any) => ({ ...p, facts: (factsBy.get(p.session_id) ?? []).slice(-40), role: roleBy.get(p.session_id) ?? null })));
  const refs = sources.map((s) => s.ref);
  const lead = plan[0]!.role;

  let next: number = cs.next_step; let revisions: number = cs.revision_rounds;
  while (next < plan.length) {
    if (Date.now() - started > BUDGET_MS) return release({ status: "waiting", next_step: next, last_error: "Paused to stay within the server time limit — it continues as soon as the case is opened again." });
    const step = plan[next]!; const role = roles.get(step.role)!;
    if (role.charter_sha256 !== await sha256Hex(role.charter)) return release({ status: "failed", last_error: `Charter integrity check failed for ${role.code}` });

    const [{ data: turnRows }, { data: outRows }] = await Promise.all([
      svc.from("board_turns").select("seq, step, role_code, team_code, kind, summary, content, verdict").eq("company_id", co).eq("case_id", caseId).order("seq"),
      svc.from("board_outputs").select("version, title, body_md").eq("company_id", co).eq("case_id", caseId).order("version", { ascending: false }).limit(1),
    ]);
    // Crash between saving a turn and advancing the pointer: the turn is already there — never repeat it.
    if ((turnRows ?? []).some((t: any) => t.step === next)) {
      next++; await svc.from("board_cases").update({ next_step: next }).eq("company_id", co).eq("id", caseId); continue;
    }
    const prior: PriorTurn[] = (turnRows ?? []).map((t: any) => ({ seq: t.seq, role: t.role_code, team: t.team_code, kind: t.kind, summary: t.summary, content: t.content }));
    const lastAudit = [...(turnRows ?? [])].reverse().find((t: any) => t.kind === "audit");
    const feedback = step.kind === "consolidation" && lastAudit?.verdict === "revise" ? lastAudit.content : null;
    const draft = outRows?.[0] ? { title: outRows[0].title, body_md: outRows[0].body_md } : null;
    const checks = step.kind === "audit" && draft ? lintDocument(draft.body_md, "formatted") : [];
    const userMsg = buildTurnMessage({ kind: cs.kind, docType: cs.doc_type, title: cs.title, brief: cs.brief ?? "", classification: cs.classification },
      step, sources, prior, draft, feedback, checks);
    const system = `${BOARD_SYSTEM}\n\nYOUR CHARTER (${role.code} v${role.version} — ${role.title})\n${role.charter}`;

    const { list, restingUntil } = await candidatesFor(svc, co, role.team_code, caseId);
    let done = false; let lastErr = ""; let rateLimited = false;
    for (const cand of list) {
      const key = `board:${caseId}:${next}:${revisions}`;
      // We hold the case lock, so a "running" run with this key is left over from a crashed worker.
      await svc.from("ai_runs").update({ status: "failed", error_text: "stale_running", finished_at: new Date().toISOString(), idempotency_key: `${key}:stale:${crypto.randomUUID()}` })
        .eq("company_id", co).eq("idempotency_key", key).eq("status", "running");
      const { data: run, error: runErr } = await svc.from("ai_runs").insert({ company_id: co, capability: "board_turn", provider: cand.provider.name,
        model: cand.provider.model, prompt_version_id: pv.id, connection_id: cand.connectionId, data_classification: cs.classification,
        requested_by_membership_id: cs.created_by_membership_id, input_sha256: await sha256Hex(system + userMsg), status: "running", idempotency_key: key }).select("id").single();
      if (runErr) {
        if (runErr.code === "23505") { lastErr = "duplicate"; break; }
        log("run_rejected", { case: caseId, code: runErr.code, policy: /PPI_AI_POLICY/.test(runErr.message ?? "") });
        lastErr = /PPI_AI_POLICY/.test(runErr.message ?? "") ? "This AI connection is not approved for this classification of data." : "Could not record the AI run.";
        continue;
      }
      let note = ""; let result: { turn: any; raw: string; model: string; dropped: number } | null = null;
      for (let attempt = 0; attempt < 2 && !result; attempt++) {
        const r = await cand.provider.generateJson({ system, user: userMsg + note, schema: BOARD_SCHEMA, timeoutMs: 50_000, temperature: 0.35, maxOutputTokens: 12_000 });
        // An occasional generation hangs; one immediate retry usually succeeds (observed 13-Nov-2026: 50 s timeout, then 25 s success).
        if (!r.ok && r.errorClass === "timeout" && attempt === 0 && Date.now() - started < BUDGET_MS - 20_000) {
          log("timeout_retry", { case: caseId, step: next, connection: cand.connectionId }); continue;
        }
        if (!r.ok) {
          lastErr = r.message; log("provider_error", { case: caseId, step: next, connection: cand.connectionId, errorClass: r.errorClass, status: r.status, detail: r.detail });
          if (r.errorClass === "rate_limit" && cand.connectionId) {
            rateLimited = true; const cd = cooldownFor("rate_limit", r.message);
            await svc.from("ai_provider_connections").update({ health: "rate_limited", last_error_class: "rate_limit", last_error_at: new Date().toISOString(),
              ...(cd ? { cooldown_until: cd.toISOString() } : {}) }).eq("company_id", co).eq("id", cand.connectionId);
          } else if (r.errorClass === "rate_limit") rateLimited = true;
          break;
        }
        const v = validateTurn(r.text, step, refs, [...roles.keys()]);
        if (!v.ok) { lastErr = v.errors.join("; "); log("invalid_output", { case: caseId, step: next, errors: v.errors }); note = `\n\nYour previous output was rejected: ${v.errors.join("; ")}. Return valid JSON matching the schema.`; continue; }
        // Deterministic document checks: one corrective retry; if they still fail, the audit sees them as confirmed defects.
        const lint = v.turn.document ? lintDocument(v.turn.document.body_md, step.kind === "format" ? "formatted" : "draft") : [];
        // Formatting may not lose content (observed 13-Nov-2026: an agreement's 26 clauses collapsed into 9 policy sections).
        const lost = step.kind === "format" && v.turn.document && draft ? preservationIssues(draft.body_md, v.turn.document.body_md) : [];
        if (lost.length && attempt === 0) { log("preservation_retry", { case: caseId, step: next, issues: lost.length }); note = `\n\nYour formatted document was rejected because it lost content: ${lost.join(" ")} Start again from current_draft and keep every section and clause.`; continue; }
        if (lost.length) {   // still losing content: keep the consolidated draft as the current version; the audit will see why
          log("preservation_rejected", { case: caseId, step: next, issues: lost.length });
          v.turn.document = null; v.turn.message = `${v.turn.message}\n\n**Automated check:** the formatted version was discarded because it lost content (${lost.join(" ")}). The consolidated draft remains the current version.`;
        }
        if (lint.length && attempt === 0) { log("lint_retry", { case: caseId, step: next, issues: lint.length }); note = `\n\nYour document failed automated checks — fix all of them and return the COMPLETE document again: ${lint.join(" ")}`; continue; }
        if (step.kind === "audit" && checks.length && v.turn.verdict === "pass") {   // the AI audit cannot overrule a confirmed defect
          v.turn.verdict = "revise"; v.turn.audit_notes = `${v.turn.audit_notes ?? ""}\n\nAutomated checks (confirmed defects): ${checks.join(" ")}`.trim();
          log("audit_overruled", { case: caseId, step: next, issues: checks.length });
        }
        result = { turn: v.turn, raw: r.text, model: r.model, dropped: v.dropped };
      }
      if (!result) {
        await svc.from("ai_runs").update({ status: "failed", error_text: lastErr.slice(0, 200), finished_at: new Date().toISOString(), schema_valid: false,
          idempotency_key: `${key}:failed:${run.id}` }).eq("company_id", co).eq("id", run.id);
        continue;
      }
      // Persist the turn (and the document, when this turn produced one).
      const t = result.turn; const seq = (turnRows?.length ?? 0) + 1;
      const content = [t.message, t.key_points.length ? `\n\n**Key points**\n${t.key_points.map((k: string) => `- ${k}`).join("\n")}` : "",
        t.audit_notes ? `\n\n**Audit notes**\n${t.audit_notes}` : "", t.dissent ? `\n\n**Dissent**\n${t.dissent}` : ""].join("");
      const { error: tErr } = await svc.from("board_turns").insert({ company_id: co, case_id: caseId, seq, step: next, role_id: role.id, role_code: role.code,
        team_code: role.team_code, kind: step.kind, addressed_to: t.addressed_to, summary: t.summary, content, key_points: t.key_points, citations: t.citations,
        verdict: t.verdict, ai_run_id: run.id });
      if (tErr) { log("turn_insert_failed", { case: caseId, code: tErr.code }); lastErr = "Could not save the turn."; break; }
      if (t.document) {
        await svc.from("board_outputs").insert({ company_id: co, case_id: caseId, version: (outRows?.[0]?.version ?? 0) + 1, title: t.document.title,
          body_md: t.document.body_md, dissent: step.kind === "consolidation" ? t.dissent : null });
      }
      await svc.from("ai_runs").update({ status: "succeeded", finished_at: new Date().toISOString(), schema_valid: true, output_sha256: await sha256Hex(result.raw),
        invalid_source_ref_count: result.dropped }).eq("company_id", co).eq("id", run.id);
      if (cand.connectionId) await svc.from("ai_provider_connections").update({ health: "connected", last_success_at: new Date().toISOString(), cooldown_until: null })
        .eq("company_id", co).eq("id", cand.connectionId);
      log("turn_ok", { case: caseId, step: next, role: role.code, kind: step.kind, connection: cand.connectionId, model: result.model });

      // After the final audit: one bounded revision round, else wait for a person.
      if (step.kind === "audit") {
        if (t.verdict === "revise" && revisions < MAX_REVISIONS && next === plan.length - 1) {
          plan = [...plan, ...revisionSteps(lead)]; revisions++;
          await svc.from("board_cases").update({ plan, revision_rounds: revisions }).eq("company_id", co).eq("id", caseId);
        } else if (next === plan.length - 1) {
          const { data: last } = await svc.from("board_outputs").select("version, title, body_md").eq("company_id", co).eq("case_id", caseId).order("version", { ascending: false }).limit(1);
          const { data: cons } = await svc.from("board_outputs").select("dissent").eq("company_id", co).eq("case_id", caseId).not("dissent", "is", null).order("version", { ascending: false }).limit(1);
          if (last?.[0]) await svc.from("board_outputs").insert({ company_id: co, case_id: caseId, version: last[0].version + 1, title: last[0].title, body_md: last[0].body_md,
            dissent: cons?.[0]?.dissent ?? null, audit_verdict: t.verdict, audit_notes: t.audit_notes });
        }
      }
      done = true; break;
    }
    if (!done) {
      if (lastErr === "duplicate") return release({ status: "waiting", next_step: next, last_error: "Another run is finishing this step; open the case again in a minute." });
      const when = restingUntil ? new Date(restingUntil).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit" }) : null;
      return release({ status: "waiting", next_step: next, last_error: rateLimited || !list.length
        ? `Paused: the AI projects for this team are resting${when ? ` until about ${when} IST` : ""}. Everything so far is saved; it continues when the case is opened again after that.`
        : `Paused: ${lastErr || "the AI could not complete this step"}. Everything so far is saved; open the case again to retry.` });
    }
    next++;
    await svc.from("board_cases").update({ next_step: next }).eq("company_id", co).eq("id", caseId);
  }
  return release({ status: "awaiting_approval", next_step: next, last_error: null });
}
