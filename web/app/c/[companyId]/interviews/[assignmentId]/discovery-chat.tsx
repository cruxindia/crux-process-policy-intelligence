"use client";
// AI-led discovery conversation (Master Corrective Prompt v2.0): the employee talks, the AI drives, the system builds
// the profile, the process inventory and a live map of each process. Every turn goes through the discovery-ai Edge Function.
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";
import { ProcessMap, type ProcessFlow } from "@/components/process-map";
import { DIMENSIONS, normaliseCoverage } from "@/lib/dimensions";
import { askColleague, saveAnswer, submitInterview } from "./actions";

export type DQuestion = { id: string; seq: number; text: string; reason: string | null; generatedBy: string; processKey: string | null; draft: string | null; suggestions: string[] };
export type DAnswer = { kind: string; text: string | null; referred: string | null; fromSuggestion?: boolean };
export type DHelp = { questionId: string; role: string; status: string; reply: string | null };
export type DMember = { id: string; name: string };
type InAction = { understood: string; process: string | null; steps_added: string[]; departments: string[]; unclear: string[] };
export type DProcess = {
  id: string; key: string; name: string; status: string; completeness: number; coverage: Record<string, string> | null;
  flow: ProcessFlow | null; flow_version: number; involvement: string | null; frequency: string | null; departments: string[] | null; purpose: string | null;
};
export type DState = {
  stage: string; focus_process_key: string | null; inventory_confirmed: boolean; profile: Record<string, string>;
  responsibilities: { name: string; kind: string; note?: string }[]; processes: DProcess[];
};
type Turn = DState & {
  ok: true; pending?: boolean; next_question: { id: string; seq: number; text: string; reason: string | null; generated_by: string; process_key?: string | null; kind?: string; suggestions?: string[] } | null;
  acknowledgement?: string | null; complete?: boolean; complete_reason?: string; progress?: number; model?: string; in_action?: InAction | null;
};
type Fail = { ok: false; error: { class: string; message: string; retry_at?: string } & Partial<DState> };
type Phase = { phase: "idle" | "thinking" | "queued" | "error" | "complete"; message?: string; retryAt?: string };

const STAGES: { key: string; label: string }[] = [
  { key: "person", label: "About you" }, { key: "responsibilities", label: "Your work" }, { key: "inventory", label: "Your activities" },
  { key: "process_deep_dive", label: "Each activity in detail" }, { key: "wrap_up", label: "Wrapping up" },
];
const PROFILE_LABEL: Record<string, string> = {
  name: "Name", designation: "Designation", department: "Department", sub_department: "Team / function", reporting_manager: "Reports to",
  location: "Location", teams_managed: "Teams managed", functions_handled: "Functions handled", accountability_areas: "Accountable for",
  decision_authority: "Decision authority", approvals_given: "Approves", approvals_received: "Needs approval from", other_roles: "Other roles",
  interacting_departments: "Works with",
};
const STATUS_LABEL: Record<string, string> = { identified: "Identified", in_discovery: "Being discussed", sufficient: "Well understood", removed: "Removed" };
const KIND_TEXT: Record<string, string> = { unknown: "I'm not sure", not_applicable: "Not applicable", refer_to_owner: "I asked a colleague", deferred: "⏳ Saved for later" };
const shown = (a: DAnswer) => a.kind === "answer" || a.kind === "depends" ? a.text ?? ""
  : KIND_TEXT[a.kind] + (a.kind === "not_applicable" && a.text ? ` — ${a.text}` : a.referred ? ` — ${a.referred}` : "");

function localProgress(s: DState) {
  const pf = Object.keys(PROFILE_LABEL).filter((k) => s.profile[k]).length / Object.keys(PROFILE_LABEL).length;
  const live = s.processes.filter((p) => p.status !== "removed");
  const inv = s.inventory_confirmed ? 1 : Math.min(1, Math.min(s.responsibilities.length, 4) / 8 + (live.length ? 0.25 : 0));
  const pr = live.length ? live.reduce((t, p) => t + p.completeness, 0) / live.length / 100 : 0;
  return Math.round(pf * 15 + inv * 15 + pr * 70);
}

export function DiscoveryChat(props: {
  companyId: string; assignmentId: string; sessionId: string; questions: DQuestion[]; answers: Record<string, DAnswer>;
  state: DState; open: boolean; canAnswer: boolean; submittedAt: string | null; aiProvider: string | null;
  members: DMember[]; help: DHelp[];
}) {
  const [questions, setQuestions] = useState(props.questions);
  const [answers, setAnswers] = useState(props.answers);
  const [st, setSt] = useState<DState>(props.state);
  const [acks, setAcks] = useState<Record<string, string>>({}); // question id -> acknowledgement shown before it
  const [actions, setActions] = useState<Record<string, InAction>>({}); // question id -> "Your answer in action" shown before it
  const [seed, setSeed] = useState<{ text: string; n: number }>({ text: "", n: 0 }); // text pushed into the composer ("Correct this")
  const [ai, setAi] = useState<Phase>({ phase: "idle" });
  const [progress, setProgress] = useState<number>(() => localProgress(props.state));
  const [tab, setTab] = useState<"map" | "list" | "me" | "later">("map");
  const [mapKey, setMapKey] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [submitting, startSubmit] = useTransition();
  const end = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLElement>(null);
  const canAnswer = props.open && props.canAnswer;
  const current = ai.phase === "thinking" ? null : questions.find((q) => !answers[q.id]) ?? null;
  const allAnswered = questions.every((q) => answers[q.id]);

  useEffect(() => { end.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [current?.id, ai.phase]);

  const apply = useCallback((s: Partial<DState> | undefined) => {
    if (!s || !Array.isArray(s.processes)) return;
    setSt((p) => ({ ...p, ...s } as DState));
  }, []);

  const runTurn = useCallback(async () => {
    setAi({ phase: "thinking" });
    let r: Turn | Fail | null = null;
    for (let attempt = 0; attempt < 8; attempt++) {
      const { data, error } = await createClient().functions.invoke("discovery-ai", { body: { action: "turn", session_id: props.sessionId } });
      r = data as Turn | null;
      if (error) {
        try { r = await (error as { context?: Response }).context?.json(); } catch { r = null; }
        r ??= { ok: false, error: { class: "network", message: "Could not reach the assistant. Check your connection and try again." } };
      }
      if (r && !r.ok && r.error.class === "busy" && attempt < 7) { await new Promise((res) => setTimeout(res, 3000)); continue; }
      if (r && !r.ok && r.error.class === "network" && attempt < 1) { await new Promise((res) => setTimeout(res, 2000)); continue; }
      break;
    }
    if (!r) { setAi({ phase: "error", message: "Unexpected reply from the assistant." }); return; }
    if (!r.ok) {
      apply(r.error);
      if (r.error.class === "queued") setAi({ phase: "queued", message: r.error.message, retryAt: r.error.retry_at });
      else setAi({ phase: "error", message: r.error.message });
      return;
    }
    apply(r);
    if (typeof r.progress === "number") setProgress(r.progress); else setProgress(localProgress({ ...st, ...r }));
    const nq = r.next_question;
    if (nq) {
      if (r.acknowledgement) setAcks((a) => ({ ...a, [nq.id]: r.acknowledgement! }));
      if (r.in_action) setActions((a) => ({ ...a, [nq.id]: r.in_action! }));
      setQuestions((qs) => qs.some((q) => q.id === nq.id) ? qs : [...qs, { id: nq.id, seq: nq.seq, text: nq.text, reason: nq.reason,
        generatedBy: nq.generated_by, processKey: nq.process_key ?? null, draft: null, suggestions: nq.suggestions ?? [] }]);
      setAi({ phase: "idle" });
    } else if (r.complete) {
      setProgress(100);
      setAi({ phase: "complete", message: r.complete_reason });
    } else setAi({ phase: "error", message: "The assistant did not return a next question." });
  }, [props.sessionId, apply, st]);

  // Ask for the next question whenever everything so far is answered (also creates the opening question).
  useEffect(() => {
    if (!canAnswer || !allAnswered || ai.phase !== "idle") return;
    const t = setTimeout(() => { void runTurn(); }, 0);
    return () => clearTimeout(t);
  }, [canAnswer, allAnswered, ai.phase, runTurn]);

  // Saved-for-later: try again automatically when the wait is over (only while this page stays open).
  useEffect(() => {
    if (ai.phase !== "queued" || !ai.retryAt) return;
    const ms = Math.max(5000, Date.parse(ai.retryAt) - Date.now() + 2000);
    if (ms > 6 * 3600_000) return;
    const t = setTimeout(() => { void runTurn(); }, ms);
    return () => clearTimeout(t);
  }, [ai.phase, ai.retryAt, runTurn]);

  const live = st.processes.filter((p) => p.status !== "removed");
  const shownKey = mapKey ?? st.focus_process_key ?? live.find((p) => p.flow?.nodes?.length)?.key ?? live[0]?.key ?? null;
  const shownProc = live.find((p) => p.key === shownKey) ?? null;
  const stageIdx = Math.max(0, STAGES.findIndex((s) => s.key === st.stage));
  const finished = ai.phase === "complete" || !props.open;
  const visible = questions.filter((q) => answers[q.id] || q.id === current?.id);
  const procName = useMemo(() => Object.fromEntries(st.processes.map((p) => [p.key, p.name])), [st.processes]);
  const later = questions.filter((q) => answers[q.id]?.kind === "deferred");
  const replyBy = useMemo(() => new Map(props.help.filter((h) => h.reply).map((h) => [h.questionId, h])), [props.help]);

  return (
    <div className="disc">
      <div className="disc-chat">
        <div className="chat-progress">
          <div className="row" style={{ justifyContent: "space-between" }}>
            <strong>{finished ? 100 : progress}% complete</strong>
            <span className="muted small">{live.length} activit{live.length === 1 ? "y" : "ies"} found</span>
          </div>
          <div className="bar"><div style={{ width: `${finished ? 100 : progress}%` }} /></div>
          <ol className="stages" aria-label="Conversation stages">
            {STAGES.map((s, i) => <li key={s.key} className={i < stageIdx || finished ? "done" : i === stageIdx ? "now" : ""}>{s.label}</li>)}
          </ol>
          <button type="button" className="secondary panel-toggle" aria-expanded={panelOpen}
            onClick={() => { const next = !panelOpen; setPanelOpen(next); if (next) setTimeout(() => panel.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50); }}>
            {panelOpen ? "Hide" : "Show"} what I&rsquo;ve understood
          </button>
        </div>

        <div className="chat">
          <div className="bubble bot">
            I&rsquo;ll guide you through a conversation to understand your role and the work you do. You don&rsquo;t need to prepare anything or
            know how to describe a “process” — just explain your work naturally and I&rsquo;ll organise it. You can say “I&rsquo;m not sure”,
            ask me to explain, add something you forgot, or correct an earlier answer at any time.
          </div>
          {props.aiProvider === "gemini_free" && (
            <div className="bubble bot small" data-testid="ai-notice">
              🔔 Your answers are sent to Google&rsquo;s Gemini AI (free version) to understand them. Google may use them to improve its
              services and people at Google may read them. Please don&rsquo;t type customers&rsquo; names, phone or account numbers, passwords
              or other private details — describe the work instead.
            </div>
          )}
          {visible.map((q) => {
            const a = answers[q.id];
            return (
              <div key={q.id}>
                {acks[q.id] && <div className="bubble bot ack">{acks[q.id]}</div>}
                {actions[q.id] && <InActionCard a={actions[q.id]!} canCorrect={canAnswer && q.id === current?.id}
                  onCorrect={() => setSeed((x) => ({ text: "That's not quite right: ", n: x.n + 1 }))} />}
                <div className="bubble bot" data-ai={q.generatedBy === "ai" ? "1" : undefined}>
                  {q.processKey && procName[q.processKey] && <div className="proc-tag">{procName[q.processKey]}</div>}
                  {q.text}
                  {q.reason && <div className="why">{q.reason}</div>}
                </div>
                {a && <div className="bubble me"><span style={{ whiteSpace: "pre-wrap" }}>{shown(a)}</span></div>}
                {replyBy.get(q.id) && <div className="bubble bot small" data-testid="colleague-reply">💬 Reply from the {replyBy.get(q.id)!.role}: {replyBy.get(q.id)!.reply}</div>}
              </div>
            );
          })}
          {canAnswer && ai.phase === "thinking" && <div className="bubble bot thinking" role="status">Thinking about your answer</div>}
          {canAnswer && ai.phase === "queued" && (
            <div className="bubble bot" role="status" data-testid="ai-queued">
              {ai.message}
              <div style={{ marginTop: 10 }}><button type="button" className="secondary" onClick={() => void runTurn()}>Check again</button></div>
            </div>
          )}
          {canAnswer && ai.phase === "error" && (
            <div className="bubble bot" role="alert" data-testid="ai-error">
              {ai.message?.replace(/\.?$/, ".")} Your answers are saved.
              <div style={{ marginTop: 10 }}><button type="button" onClick={() => void runTurn()}>Try again</button></div>
            </div>
          )}
          {finished && (props.open ? (
            <div className="bubble bot" data-testid="disc-complete">
              {ai.message ? `${ai.message} ` : ""}Thank you — that&rsquo;s everything for now. Have a look at the summary of what I understood, then press <strong>Submit</strong>.
              {later.length > 0 && <> You saved {later.length} question{later.length === 1 ? "" : "s"} for later — you can answer {later.length === 1 ? "it" : "them"} under <strong>Saved for later</strong> first.</>}
              You can still add or correct something by typing it below before you submit.
              {props.canAnswer && (
                <div style={{ marginTop: 10 }}>
                  <button type="button" disabled={submitting} onClick={() => startSubmit(() => submitInterview(props.companyId, props.assignmentId, props.sessionId))}>
                    {submitting ? "Submitting…" : "Submit"}
                  </button>
                </div>
              )}
            </div>
          ) : <div className="bubble bot">✅ Submitted{props.submittedAt ? ` on ${props.submittedAt.slice(0, 10)}` : ""}. Thank you! Your manager will review the draft and may come back with a few questions.</div>)}
          <div ref={end} />
        </div>

        {current && canAnswer && (
          <Composer key={current.id} q={current} companyId={props.companyId} assignmentId={props.assignmentId} members={props.members} seed={seed}
            onSaved={(id, a) => setAnswers((p) => ({ ...p, [id]: a }))} />
        )}
      </div>

      <aside ref={panel} className={`disc-panel${panelOpen ? " open" : ""}`} aria-label="What I've understood so far">
        <a className="small" href={`/c/${props.companyId}/work/${props.sessionId}`} style={{ float: "right" }}>Full summary →</a>
        <div className="tabs" role="tablist">
          {([["map", "Process map"], ["list", `Activities (${live.length})`], ["me", "About you"], ...(later.length ? [["later", `Saved for later (${later.length})`]] : [])] as [typeof tab, string][]).map(([k, l]) => (
            <button key={k} type="button" role="tab" aria-selected={tab === k} className={tab === k ? "tab on" : "tab"} onClick={() => setTab(k)}>{l}</button>
          ))}
        </div>
        {tab === "map" && (
          <div>
            {live.length > 1 && (
              <select aria-label="Choose activity" value={shownKey ?? ""} onChange={(e) => setMapKey(e.target.value)} style={{ marginBottom: 8 }}>
                {live.map((p) => <option key={p.key} value={p.key}>{p.name}{p.key === st.focus_process_key ? " (now)" : ""}</option>)}
              </select>
            )}
            {shownProc ? (
              <>
                <div className="row" style={{ justifyContent: "space-between", marginBottom: 6 }}>
                  <strong>{shownProc.name}</strong>
                  <span className="muted small">{shownProc.flow_version ? `version ${shownProc.flow_version}` : ""}</span>
                </div>
                <ProcessMap flow={shownProc.flow} />
                <p className="muted small" style={{ marginTop: 6 }}>Something wrong? Just tell me in the chat, e.g. “That&rsquo;s not how it happens — …”.</p>
              </>
            ) : <p className="muted small">Your activities will appear here as we talk.</p>}
          </div>
        )}
        {tab === "list" && (
          <ul className="proc-list">
            {live.length === 0 && <li className="muted small">Nothing yet — tell me about your work.</li>}
            {live.map((p) => (
              <li key={p.key}>
                <button type="button" className="linkish" onClick={() => { setMapKey(p.key); setTab("map"); }}>{p.name}</button>
                <span className={`badge ${p.status === "sufficient" ? "ok" : p.status === "in_discovery" ? "part" : ""}`}>{STATUS_LABEL[p.status] ?? p.status}</span>
                <div className="bar thin"><div style={{ width: `${p.completeness}%` }} /></div>
                <div className="muted small">{[p.frequency, p.involvement, ...(p.departments ?? [])].filter(Boolean).join(" · ")}</div>
                <Dims coverage={p.coverage} />
              </li>
            ))}
          </ul>
        )}
        {tab === "later" && (
          <div data-testid="later-list">
            <p className="muted small">Answer these whenever you&rsquo;re ready — before you submit.</p>
            {later.map((q) => <LaterItem key={q.id} q={q} companyId={props.companyId} assignmentId={props.assignmentId} disabled={!canAnswer}
              onSaved={(id, a) => setAnswers((p) => ({ ...p, [id]: a }))} />)}
          </div>
        )}
        {tab === "me" && (
          <div>
            <dl className="kv">
              {Object.entries(PROFILE_LABEL).filter(([k]) => st.profile[k]).map(([k, l]) => <div key={k}><dt>{l}</dt><dd>{st.profile[k]}</dd></div>)}
            </dl>
            {st.responsibilities.length > 0 && <>
              <h3 style={{ fontSize: 14, marginTop: 12 }}>What you do</h3>
              <ul className="small">{st.responsibilities.map((r) => <li key={r.name}>{r.name} <span className="muted">· {r.kind.replace(/_/g, " ")}</span></li>)}</ul>
            </>}
          </div>
        )}
      </aside>
    </div>
  );
}

/** The 20 dimensions of a process (blueprint §6C) — covered, partly covered, not applicable or not yet discussed. */
function Dims({ coverage }: { coverage: Record<string, string> | null }) {
  const c = normaliseCoverage(coverage);
  return (
    <div className="dims small">
      {DIMENSIONS.map((d) => { const s = c[d.key]; return <span key={d.key} title={d.ask}
        className={`badge ${s === "sufficient" ? "ok" : s === "partial" ? "part" : s === "not_applicable" ? "na" : ""}`}>{d.label}{s === "not_applicable" ? " · n/a" : ""}</span>; })}
    </div>
  );
}

/** "Your answer in action" (blueprint §9): what was understood, what it added to the map, who is affected, what is unclear. */
function InActionCard({ a, canCorrect, onCorrect }: { a: InAction; canCorrect: boolean; onCorrect: () => void }) {
  const [ok, setOk] = useState(false);
  return (
    <div className="bubble bot in-action" data-testid="in-action">
      <strong>Your answer in action</strong>
      <div className="small" style={{ marginTop: 4 }}>I understood: {a.understood}</div>
      {a.steps_added.length > 0 && <div className="small">Added to the map{a.process ? ` of “${a.process}”` : ""}: {a.steps_added.join(" → ")}</div>}
      {a.departments.length > 0 && <div className="small">Teams involved: {a.departments.join(", ")}</div>}
      {a.unclear.length > 0 && <div className="small muted">Still unclear: {a.unclear.join("; ")}</div>}
      {ok ? <div className="small muted" style={{ marginTop: 6 }}>Thanks for checking.</div> : canCorrect && (
        <div className="chips" style={{ marginTop: 8 }}>
          <button type="button" className="chip ghost" onClick={() => setOk(true)}>That&rsquo;s right</button>
          <button type="button" className="chip ghost" onClick={onCorrect}>Correct this</button>
        </div>
      )}
    </div>
  );
}

function LaterItem(props: { q: DQuestion; companyId: string; assignmentId: string; disabled: boolean; onSaved: (id: string, a: DAnswer) => void }) {
  const [text, setText] = useState(""); const [error, setError] = useState(""); const [pending, start] = useTransition();
  const send = () => start(async () => {
    const r = await saveAnswer({ companyId: props.companyId, assignmentId: props.assignmentId, questionId: props.q.id, kind: "answer", text: text.trim(),
      basis: "direct", referredNote: "", revisionReason: "Answered after saving it for later" });
    if (!r.ok) setError(r.error); else props.onSaved(props.q.id, { kind: "answer", text: text.trim(), referred: null });
  });
  return (
    <div className="card" style={{ padding: 10, marginBottom: 8 }}>
      <div className="small">{props.q.text}</div>
      {error && <div className="notice error small">{error}</div>}
      <textarea aria-label={`Answer to: ${props.q.text}`} rows={2} value={text} onChange={(e) => setText(e.target.value)} disabled={props.disabled} />
      <button type="button" disabled={props.disabled || pending || !text.trim()} onClick={send} style={{ marginTop: 6 }}>{pending ? "…" : "Answer"}</button>
    </div>
  );
}

function Composer(props: { q: DQuestion; companyId: string; assignmentId: string; members: DMember[]; seed: { text: string; n: number };
  onSaved: (id: string, a: DAnswer) => void }) {
  const { q } = props;
  const [text, setText] = useState(q.draft ?? "");
  const [picked, setPicked] = useState<string | null>(null);   // the suggestion tapped (if the text still equals it, the answer is "from a suggestion")
  const [mode, setMode] = useState<"" | "na" | "ask">("");
  const [extra, setExtra] = useState("");                       // N/A reason or the note to the colleague
  const [helper, setHelper] = useState("");
  const [error, setError] = useState("");
  const [saveState, setSaveState] = useState("");
  const [pending, start] = useTransition();
  const db = useRef<ReturnType<typeof createClient> | null>(null);
  const box = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!text.trim()) return;
    const t = setTimeout(() => {
      db.current ??= createClient();
      void db.current.from("interview_answer_drafts").upsert(
        { company_id: props.companyId, question_id: q.id, draft_text: text, updated_at: new Date().toISOString() },
        { onConflict: "company_id,question_id" }).then(({ error }) => setSaveState(error ? "Draft not saved" : "Draft saved"));
    }, 700);
    return () => clearTimeout(t);
  }, [text, q.id, props.companyId]);

  const prefill = useCallback((s: string) => { setPicked(null); setText(s); setTimeout(() => { box.current?.focus(); box.current?.setSelectionRange(s.length, s.length); }, 0); }, []);
  useEffect(() => {
    if (!props.seed.n) return;
    const t = setTimeout(() => prefill(props.seed.text), 0);
    return () => clearTimeout(t);
  }, [props.seed, prefill]);

  function send(kind: string, value: string) {
    setError("");
    start(async () => {
      const fromSuggestion = kind === "answer" && picked !== null && value === picked;
      const r = await saveAnswer({ companyId: props.companyId, assignmentId: props.assignmentId, questionId: q.id,
        kind, text: value, basis: "direct", referredNote: "", revisionReason: "", fromSuggestion });
      if (!r.ok) { setError(r.error); return; }
      props.onSaved(q.id, { kind, text: value || null, referred: null, fromSuggestion });
    });
  }
  function ask() {
    setError("");
    start(async () => {
      const r = await askColleague({ companyId: props.companyId, assignmentId: props.assignmentId, questionId: q.id, helperId: helper, note: extra });
      if (!r.ok) { setError(r.error); return; }
      props.onSaved(q.id, { kind: "refer_to_owner", text: null, referred: `${props.members.find((m) => m.id === helper)?.name ?? "a colleague"} will be asked` });
    });
  }

  return (
    <div className="composer">
      {error && <div className="notice error" style={{ margin: "0 0 8px" }}>{error}</div>}
      {q.suggestions.length > 0 && mode === "" && (
        <div style={{ marginBottom: 8 }}>
          <div className="small muted">Suggested answers (guesses from what we know so far — tap one only if it is true, adjust it, or write your own):</div>
          <div className="chips" style={{ marginTop: 4 }}>
            {q.suggestions.map((s) => <button key={s} type="button" data-testid="suggestion" className={`chip${picked === s ? "" : " sug"}`} disabled={pending}
              onClick={() => { setText(s); setPicked(s); }}>{s}</button>)}
          </div>
        </div>
      )}
      {mode === "na" ? (
        <div className="row" style={{ flexWrap: "nowrap" }}>
          <input aria-label="Why it does not apply" value={extra} onChange={(e) => setExtra(e.target.value)} placeholder="Why does this not apply to your work?" />
          <button type="button" disabled={pending || !extra.trim()} onClick={() => send("not_applicable", extra.trim())}>OK</button>
          <button type="button" className="secondary" onClick={() => setMode("")}>Back</button>
        </div>
      ) : mode === "ask" ? (
        <div data-testid="ask-colleague">
          <div className="row" style={{ flexWrap: "nowrap" }}>
            <select aria-label="Colleague" value={helper} onChange={(e) => setHelper(e.target.value)}>
              <option value="">Who knows the answer?</option>
              {props.members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </div>
          <input aria-label="Note to your colleague" value={extra} onChange={(e) => setExtra(e.target.value)} placeholder="Optional note, e.g. “You handle the payment approvals”"
            style={{ marginTop: 6 }} />
          <div className="row" style={{ marginTop: 6 }}>
            <button type="button" disabled={pending || !helper} onClick={ask}>{pending ? "…" : "Send request"}</button>
            <button type="button" className="secondary" onClick={() => setMode("")}>Back</button>
          </div>
          <div className="small muted" style={{ marginTop: 4 }}>They get a request in “Requests”. Their reply is added to your interview; you can carry on meanwhile.</div>
        </div>
      ) : (
        <div className="row" style={{ alignItems: "flex-end", flexWrap: "nowrap" }}>
          <textarea ref={box} aria-label="Your answer" value={text} onChange={(e) => setText(e.target.value)} placeholder="Type your answer in your own words…" rows={2}
            onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && text.trim()) send("answer", text.trim()); }} />
          <button type="button" disabled={pending || !text.trim()} onClick={() => send("answer", text.trim())}>{pending ? "…" : "Send"}</button>
        </div>
      )}
      {mode === "" && (
        <div className="chips" style={{ marginTop: 8 }}>
          <button type="button" className="chip ghost" disabled={pending} onClick={() => send("unknown", "")}>I&rsquo;m not sure</button>
          <button type="button" className="chip ghost" disabled={pending} onClick={() => send("answer", "I didn't understand the question — can you explain it with an example?")}>Explain with an example</button>
          <button type="button" className="chip ghost" disabled={pending} onClick={() => { setExtra(""); setMode("na"); }}>Not applicable</button>
          <button type="button" className="chip ghost" disabled={pending} onClick={() => { setExtra(""); setMode("ask"); }}>Ask a colleague</button>
          <button type="button" className="chip ghost" disabled={pending} onClick={() => send("deferred", "")}>Save for later</button>
          <button type="button" className="chip ghost" disabled={pending} onClick={() => prefill("I forgot one more responsibility: ")}>I forgot something</button>
          <button type="button" className="chip ghost" disabled={pending} onClick={() => prefill("Let me correct my earlier answer: ")}>Correct an earlier answer</button>
        </div>
      )}
      <div className="small muted" style={{ marginTop: 6 }}>{saveState}</div>
    </div>
  );
}
