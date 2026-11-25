// doc-ai — Supabase Edge Function (Deno). Analyses a company's rule documents one at a time (SOW 12G Q6).
//   {action:"next", company_id}  company administrators; analyses the next queued document and returns what is left.
// Document text is "confidential": the ai_runs policy check refuses any provider not approved for it (free tiers that train
// on inputs are capped at "internal" by the database), so such providers are skipped. Names of the company's people are
// replaced by "the employee" before anything is sent. Logs hold metadata only.
import { createClient } from "npm:@supabase/supabase-js@2.118.0";
import { GeminiProvider, OllamaProvider, providerFromEnv, type AiProvider } from "../_shared/ai-provider.ts";
import { DOC_PROMPT_KEY, DOC_SCHEMA, DOC_SYSTEM, buildDocMessage, controlFieldFinding, rankCandidates, validateDocAnalysis, type Candidate } from "../_shared/doc-analysis.ts";
import { dice, stepTokens } from "../_shared/compare.ts";
import { nameTokens, redactNames } from "../_shared/names.ts";
import { cooldownFor, rankConnections, type Conn } from "../_shared/routing.ts";
import { poolCandidates } from "../_shared/pool.ts";

const ALLOWED = (Deno.env.get("ALLOWED_ORIGINS") ?? "https://crux-ppi.netlify.app,http://localhost:3000").split(",");
const cors = (o: string | null) => ({ "access-control-allow-origin": o && ALLOWED.includes(o) ? o : ALLOWED[0]!,
  "access-control-allow-headers": "authorization, x-client-info, apikey, content-type", "access-control-allow-methods": "POST, OPTIONS", vary: "origin" });
function apiKey(dictVar: string, legacy: string) {
  try { const o = JSON.parse(Deno.env.get(dictVar) ?? ""); const k = o.default ?? Object.values(o)[0]; if (typeof k === "string" && k) return k; } catch { /* unset */ }
  return Deno.env.get(legacy) ?? "";
}
const log = (event: string, d: Record<string, unknown>) => console.log(JSON.stringify({ fn: "doc-ai", event, ...d }));
const sha256Hex = async (s: string) => [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)))].map((x) => x.toString(16).padStart(2, "0")).join("");
// deno-lint-ignore no-explicit-any
type Db = any;

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
  if (body.action !== "next" || !body.company_id) return json({ ok: false, error: { message: "Unknown action" } }, 400);
  const co = body.company_id;
  const { data: perms } = await userDb.rpc("my_permissions", { p_company: co });
  const list: string[] = Array.isArray(perms) ? perms.map((x: unknown) => typeof x === "string" ? x : String(Object.values(x as object)[0])) : [];
  if (!list.includes("org.manage")) return json({ ok: false, error: { message: "Only company administrators can run the analysis." } }, 403);
  const { data: me } = await userDb.from("memberships").select("id").eq("company_id", co).eq("user_id", u.user.id).eq("status", "active").maybeSingle();
  if (!me) return json({ ok: false, error: { message: "Not a member." } }, 403);
  try { return json(await next(svc, co, me.id)); }
  catch (e) { log("crash", { message: String((e as Error)?.message ?? e).slice(0, 200) }); return json({ ok: false, error: { message: "The analysis stopped unexpectedly; try again." } }, 500); }
});

async function remaining(svc: Db, co: string) {
  const { count } = await svc.from("source_documents").select("id", { count: "exact", head: true }).eq("company_id", co).eq("category", "governing")
    .eq("read_status", "read").in("analysis_status", ["queued", "running", "waiting_provider"]);
  return count ?? 0;
}

async function candidates(svc: Db, co: string): Promise<{ provider: AiProvider; connectionId: string | null; label: string }[]> {
  const [{ data: cs }, { data: as }] = await Promise.all([
    svc.from("ai_provider_connections").select("id, name, provider, policy_provider, model, base_url, priority, status, cooldown_until, vault_secret_id").eq("company_id", co),
    svc.from("ai_connection_assignments").select("connection_id, department_id, process_id, interview_category, active").eq("company_id", co),
  ]);
  const conns: Conn[] = (cs ?? []).map((c: any) => ({ ...c, has_key: !!c.vault_secret_id, assignments: (as ?? []).filter((a: any) => a.connection_id === c.id) }));
  const out: { provider: AiProvider; connectionId: string | null; label: string }[] = [];
  for (const c of rankConnections(conns, { departmentId: null, processId: null, category: "documents", stickyKey: co })) {
    if (out.length >= 3) break;
    if (c.provider === "ollama") { if (c.base_url) out.push({ provider: new OllamaProvider(c.base_url, c.model), connectionId: c.id, label: c.name }); continue; }
    const { data: key } = await svc.rpc("ai_connection_get_key", { p_company: co, p_connection: c.id });
    if (key) out.push({ provider: new GeminiProvider(String(key), c.model, c.policy_provider), connectionId: c.id, label: c.name });
  }
  out.push(...await poolCandidates(svc, co, "confidential"));
  const def = providerFromEnv((k) => Deno.env.get(k));
  if (!(def instanceof GeminiProvider) || Deno.env.get("GEMINI_API_KEY")) out.push({ provider: def, connectionId: null, label: "Server default" });
  return out;
}

async function next(svc: Db, co: string, requester: string) {
  const { data: pv } = await svc.from("prompt_versions").select("id, template_sha256").eq("company_id", co).eq("prompt_key", DOC_PROMPT_KEY)
    .eq("status", "active").order("version", { ascending: false }).limit(1).maybeSingle();
  if (!pv || pv.template_sha256 !== await sha256Hex(DOC_SYSTEM + JSON.stringify(DOC_SCHEMA)))
    return { ok: false, error: { message: "Document analysis is not set up for this company yet (prompt version not registered)." } };
  const { data: docId } = await svc.rpc("doc_claim_next", { p_company: co });
  if (!docId) return { ok: true, done: null, remaining: await remaining(svc, co) };
  const release = (patch: Record<string, unknown>) => svc.from("source_documents").update({ ...patch, updated_at: new Date().toISOString() }).eq("company_id", co).eq("id", docId);

  const [{ data: doc }, { data: txt }, { data: adopted }] = await Promise.all([
    svc.from("source_documents").select("id, file_name, folder, doc_type, department_code").eq("company_id", co).eq("id", docId).single(),
    svc.from("source_document_texts").select("body").eq("company_id", co).eq("document_id", docId).maybeSingle(),
    svc.from("company_baselines").select("version_id, adopted_at").eq("company_id", co).order("adopted_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (!txt?.body) { await release({ analysis_status: "failed", analysis_error: "No text stored" }); return { ok: true, done: { id: docId, file_name: doc?.file_name, error: "No text" }, remaining: await remaining(svc, co) }; }
  // People's names never leave: the company's members, plus the person named in role documents like "KRA - Firstname Lastname".
  const { data: ms } = await svc.from("memberships").select("user_id").eq("company_id", co).limit(5000);
  const { data: ups } = (ms ?? []).length ? await svc.from("user_profiles").select("display_name").in("id", (ms ?? []).map((m: any) => m.user_id)) : { data: [] };
  const names = nameTokens((ups ?? []).map((x: any) => x.display_name));
  const text = redactNames(txt.body, names) ?? "";
  const fileName = redactNames(doc.file_name, names) ?? doc.file_name;

  // Checklist candidates from the adopted baseline (or the newest active one).
  let versionId = adopted?.version_id ?? null;
  if (!versionId) versionId = (await svc.from("baseline_versions").select("id").eq("status", "active").order("activated_at", { ascending: false }).limit(1).maybeSingle()).data?.id ?? null;
  const { data: items } = versionId ? await svc.from("baseline_items").select("code, title, department, data").eq("version_id", versionId).eq("sheet", "Department Register") : { data: [] };
  const all: Candidate[] = (items ?? []).filter((i: any) => i.code).map((i: any) => ({ code: i.code, title: i.title ?? i.code, department: i.department, should_contain: String(i.data?.["What the document should contain"] ?? "") }));
  const cands = rankCandidates(fileName, text, all, doc.department_code, 10);
  const userMsg = buildDocMessage({ fileName, folder: doc.folder, docType: doc.doc_type, department: doc.department_code }, text, cands);

  let lastErr = "no AI provider is approved for confidential documents"; let policyBlocked = 0; let tried = 0;
  const provs = await candidates(svc, co);
  for (const cand of provs) {
    tried++;
    const key = `doc:${docId}:${cand.connectionId ?? cand.label}`;
    const { data: air, error: airErr } = await svc.from("ai_runs").insert({ company_id: co, capability: "document_analysis", provider: cand.provider.name, model: cand.provider.model,
      prompt_version_id: pv.id, connection_id: cand.connectionId, data_classification: "confidential", requested_by_membership_id: requester,
      input_sha256: await sha256Hex(DOC_SYSTEM + userMsg), status: "running", idempotency_key: `${key}:${crypto.randomUUID()}` }).select("id").single();
    if (airErr) { if (/PPI_AI_POLICY/.test(airErr.message ?? "")) policyBlocked++; log("run_rejected", { code: airErr.code, policy: /PPI_AI_POLICY/.test(airErr.message ?? "") }); continue; }
    let note = ""; let done = false;
    for (let attempt = 0; attempt < 2 && !done; attempt++) {
      const r = await cand.provider.generateJson({ system: DOC_SYSTEM, user: userMsg + note, schema: DOC_SCHEMA, timeoutMs: 55_000, temperature: 0.2, maxOutputTokens: 8000 });
      if (!r.ok) {
        lastErr = r.message; log("provider_error", { connection: cand.connectionId, errorClass: r.errorClass, status: r.status, detail: r.detail });
        if (r.errorClass === "rate_limit" && cand.connectionId) {
          const cd = cooldownFor("rate_limit", r.message);
          await svc.from("ai_provider_connections").update({ health: "rate_limited", last_error_class: "rate_limit", last_error_at: new Date().toISOString(), ...(cd ? { cooldown_until: cd.toISOString() } : {}) })
            .eq("company_id", co).eq("id", cand.connectionId);
        }
        break;
      }
      const v = validateDocAnalysis(r.text, cands.map((c) => c.code), text);
      if (!v.ok) { lastErr = v.error; note = `\n\nYour previous output was rejected: ${v.error}. Return valid JSON matching the schema.`; continue; }
      await persist(svc, co, doc, air.id, v.result, cands);
      await svc.from("ai_runs").update({ status: "succeeded", finished_at: new Date().toISOString(), schema_valid: true, output_sha256: await sha256Hex(r.text),
        invalid_source_ref_count: v.dropped.codes + v.dropped.evidence }).eq("company_id", co).eq("id", air.id);
      log("ok", { processes: v.result.processes.length, gaps: v.result.gaps.length, matches: v.result.matches.length, dropped: v.dropped });
      done = true;
    }
    if (done) return { ok: true, done: { id: docId, file_name: doc.file_name }, remaining: await remaining(svc, co) };
    await svc.from("ai_runs").update({ status: "failed", error_text: lastErr.slice(0, 200), finished_at: new Date().toISOString(), schema_valid: false }).eq("company_id", co).eq("id", air.id);
  }
  // Nothing could take it: leave it waiting (not failed) so it runs once an approved AI is available.
  const noProvider = !tried || policyBlocked === tried;
  await release({ analysis_status: noProvider ? "waiting_provider" : "queued", analysis_error: noProvider
    ? "No AI connection is approved for confidential documents. In Administration → AI connections, approve one (for example Groq) for confidential data."
    : `Paused: ${lastErr}` });
  return { ok: true, done: null, waiting: noProvider ? "provider" : "retry", message: noProvider
    ? "No AI connection is approved for confidential documents yet. Approve one in Administration → AI connections; the documents wait safely until then."
    : `The AI could not finish just now (${lastErr}). Everything is saved; try again in a few minutes.`, remaining: await remaining(svc, co) };
}

async function persist(svc: Db, co: string, doc: any, runId: string, a: any, cands: Candidate[]) {
  const { data: an } = await svc.from("document_analyses").insert({ company_id: co, document_id: doc.id, ai_run_id: runId, result: a }).select("id").single();
  const dept0 = a.departments[0] ?? doc.department_code ?? null;
  if (a.processes.length) await svc.from("doc_processes").insert(a.processes.map((p: any) => ({ company_id: co, document_id: doc.id, analysis_id: an.id, name: p.name,
    department_code: p.department ?? dept0, owner_role: p.owner_role, purpose: p.purpose, trigger_text: p.trigger, flow: p.flow, controls: p.controls, approvals: p.approvals,
    records: p.records, sla: p.sla })));
  const codes = [...new Set([...a.matches.map((m: any) => m.code), ...a.gaps.map((g: any) => g.code).filter(Boolean)])];
  const { data: reg } = codes.length ? await svc.from("register_items").select("id, code").eq("company_id", co).eq("kind", "document").in("code", codes) : { data: [] };
  const regBy = new Map((reg ?? []).map((r: any) => [r.code, r.id]));
  const findings: Record<string, unknown>[] = [];
  const base = { company_id: co, document_id: doc.id, analysis_id: an.id };
  for (const g of a.gaps) findings.push({ ...base, kind: "gap", severity: g.severity, department_code: dept0, title: g.text, evidence: g.evidence, register_item_id: g.code ? regBy.get(g.code) ?? null : null });
  for (const l of a.loose_ends) findings.push({ ...base, kind: "loose_end", severity: "medium", department_code: dept0, title: l.text, evidence: l.evidence });
  for (const r of a.risks) findings.push({ ...base, kind: "risk", severity: r.severity, department_code: dept0, title: r.risk, detail: r.impact, mitigation: r.mitigation });
  for (const q of a.questions) findings.push({ ...base, kind: "question", severity: "low", department_code: q.department ?? dept0, title: q.question, detail: q.role ? `Ask: ${q.role}` : null });
  const cf = controlFieldFinding(a.control_fields);
  if (cf) findings.push({ ...base, kind: "control_field", severity: cf.severity, department_code: dept0, title: cf.title, mitigation: cf.mitigation, source: "rule" });
  // Documents and forms it refers to that were not brought in (wording match against the company's file names).
  const refs = a.references.filter((r: any) => r.kind === "document" || r.kind === "form");
  if (refs.length) {
    const { data: names } = await svc.from("source_documents").select("file_name").eq("company_id", co).limit(20000);
    const toks = (names ?? []).map((n: any) => stepTokens(String(n.file_name).replace(/\.[^.]+$/, "")));
    for (const r of refs) if (!toks.some((t: Set<string>) => dice(t, stepTokens(r.name)) >= 0.6))
      findings.push({ ...base, kind: "missing_reference", severity: "low", department_code: dept0, title: `Referred to but not provided: ${r.name}`, source: "rule" });
  }
  for (let i = 0; i < findings.length; i += 100) await svc.from("doc_findings").insert(findings.slice(i, i + 100));
  const links = a.matches.filter((m: any) => regBy.has(m.code)).map((m: any) => ({ company_id: co, document_id: doc.id, register_item_id: regBy.get(m.code), coverage: m.coverage, why: m.why }));
  if (links.length) await svc.from("doc_register_links").upsert(links, { onConflict: "company_id,document_id,register_item_id" });
  await svc.from("source_documents").update({ analysis_status: "done", analysis_error: null, department_code: doc.department_code ?? dept0,
    doc_type: a.kind === "other" ? doc.doc_type : a.kind, updated_at: new Date().toISOString() }).eq("company_id", co).eq("id", doc.id);
  void cands;
}
