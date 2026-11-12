"use client";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";
import { saveAnswer, submitInterview } from "./actions";

export type ChatQuestion = {
  id: string; seq: number; text: string; help: string | null; scope: string;
  answerType: string; choices: string[] | null; draft: string | null;
  generatedBy?: string; reason?: string | null; dimension?: string | null;
};
export type ChatAnswer = { kind: string; text: string | null; basis: string; referred: string | null; rev: number };
export type Clarification = { id?: string; description: string; status?: string; question_id: string | null };

const SECTION: Record<string, { n: number; title: string; intro: string }> = {
  general: { n: 1, title: "About you", intro: "Let's start with a few questions about you and your role." },
  company_dna: { n: 2, title: "About CRUX", intro: "Next, tell us how you see the company." },
  process: { n: 3, title: "Your work", intro: "Finally, walk us through the main work you do, step by step." },
  ai: { n: 3, title: "Your work", intro: "Now I'll ask about your work, one question at a time. Each question builds on what you've told me." },
};
// Discovery dimensions (same keys as supabase/functions/_shared/engine.ts).
const DIMS: { key: string; label: string }[] = [
  { key: "company_context", label: "Company & role" }, { key: "purpose", label: "Purpose" }, { key: "trigger", label: "Trigger & inputs" },
  { key: "ownership", label: "Ownership" }, { key: "workflow", label: "Steps" }, { key: "systems", label: "Systems & records" },
  { key: "tat", label: "Turnaround" }, { key: "exceptions", label: "Exceptions" }, { key: "controls", label: "Approvals & checks" },
  { key: "dependencies", label: "Other departments" }, { key: "performance", label: "Performance" },
];
const DIM_LABEL = Object.fromEntries(DIMS.map((d) => [d.key, d.label]));
const KIND_TEXT: Record<string, string> = { unknown: "I don't know", not_applicable: "Not applicable to my work", refer_to_owner: "Someone else knows" };
const BASIS: Record<string, string> = { direct: "my own work", documented: "a document or record", hearsay: "what I was told", assumed: "my best guess" };

function shown(a: ChatAnswer) {
  if (a.kind === "answer" || a.kind === "depends") return a.text ?? "";
  return KIND_TEXT[a.kind] + (a.kind === "refer_to_owner" && a.referred ? ` — ${a.referred}` : "");
}

type TurnQuestion = { id: string; seq: number; text: string; reason: string | null; dimension: string | null; generated_by: string; kind: string | null };
type TurnResponse =
  | { ok: true; pending?: boolean; next_question: TurnQuestion | null; complete?: boolean; complete_reason?: string;
      coverage?: Record<string, string>; progress?: number; clarifications?: Clarification[]; resolved?: string[]; model?: string }
  | { ok: false; error: { class: string; message: string } };
type AiPhase = { phase: "idle" | "thinking" | "error" | "complete"; message?: string; model?: string };

export function Chat(props: {
  companyId: string; assignmentId: string; sessionId: string; firstName: string;
  questions: ChatQuestion[]; answers: Record<string, ChatAnswer>; open: boolean; canAnswer: boolean; submittedAt: string | null;
  adaptive?: boolean; aiProvider?: string | null; coverage?: Record<string, string>; clarifications?: Clarification[];
}) {
  const adaptive = !!props.adaptive;
  const [questions, setQuestions] = useState(props.questions);
  const [answers, setAnswers] = useState(props.answers);
  const [coverage, setCoverage] = useState<Record<string, string>>(props.coverage ?? {});
  const [clars, setClars] = useState<Clarification[]>(props.clarifications ?? []);
  const [ai, setAi] = useState<AiPhase>({ phase: "idle" });
  const [editing, setEditing] = useState<string | null>(null);
  const firstOpen = questions.find((q) => !answers[q.id])?.id ?? null;
  const currentId = editing ?? (ai.phase === "thinking" ? null : firstOpen);
  const current = questions.find((q) => q.id === currentId) ?? null;
  const [basis, setBasis] = useState("direct");
  const [submitting, startSubmit] = useTransition();
  const end = useRef<HTMLDivElement>(null);
  const canAnswer = props.open && props.canAnswer;
  const allAnswered = questions.every((q) => answers[q.id]);

  // Keep the newest question in view.
  useEffect(() => { end.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [currentId, ai.phase]);

  // Adaptive mode: once every question so far is answered, ask the server-side AI engine for the next one.
  const runTurn = useCallback(async (): Promise<void> => {
    setAi((p) => ({ ...p, phase: "thinking", message: undefined }));
    let r: TurnResponse | null = null;
    for (let attempt = 0; attempt < 6; attempt++) {
      const { data, error } = await createClient().functions.invoke("interview-ai", { body: { action: "turn", session_id: props.sessionId } });
      r = data as TurnResponse | null;
      if (error) {
        try { r = await (error as { context?: Response }).context?.json(); } catch { r = null; }
        r ??= { ok: false, error: { class: "network", message: "Could not reach the AI interviewer. Check your connection and try again." } };
      }
      // Another request is still analysing this answer: wait and ask again.
      if (r && !r.ok && r.error.class === "busy" && attempt < 5) { await new Promise((res) => setTimeout(res, 3000)); continue; }
      break;
    }
    if (!r || !r.ok) {
      const e = r && !r.ok ? r.error : { class: "unknown", message: "Unexpected reply from the AI interviewer." };
      setAi((p) => ({ ...p, phase: "error", message: e.message }));
      return;
    }
    if (r.coverage) setCoverage(r.coverage);
    if (r.clarifications?.length) setClars((c) => [...c, ...r.clarifications!]);
    if (r.resolved?.length) setClars((c) => c.map((x) => (x.id && r.resolved!.includes(x.id) ? { ...x, status: "resolved" } : x)));
    const nq = r.next_question;
    if (nq) {
      setQuestions((qs) => qs.some((q) => q.id === nq.id) ? qs : [...qs, {
        id: nq.id, seq: nq.seq, text: nq.text, help: null, scope: "ai", answerType: "text", choices: null, draft: null,
        generatedBy: nq.generated_by, reason: nq.reason, dimension: nq.dimension,
      }]);
      setAi({ phase: "idle", model: r.model });
    } else if (r.complete) {
      setAi({ phase: "complete", message: r.complete_reason, model: r.model });
    } else {
      setAi({ phase: "error", message: "The AI interviewer did not return a next question." });
    }
  }, [props.sessionId]);

  useEffect(() => {
    if (!adaptive || !canAnswer || !allAnswered || editing || ai.phase !== "idle") return;
    const t = setTimeout(() => { void runTurn(); }, 0);
    return () => clearTimeout(t);
  }, [adaptive, canAnswer, allAnswered, editing, ai.phase, runTurn]);

  const templates = questions.filter((q) => q.generatedBy !== "ai");
  const progress = useMemo(() => {
    const by: Record<string, { done: number; total: number }> = {};
    for (const q of questions) {
      if (adaptive && q.scope === "ai") continue;
      by[q.scope] ??= { done: 0, total: 0 };
      by[q.scope]!.total++;
      if (answers[q.id]) by[q.scope]!.done++;
    }
    const done = Object.keys(answers).filter((k) => questions.some((q) => q.id === k)).length;
    if (!adaptive) return { by, pct: questions.length ? Math.round((done / questions.length) * 100) : 0, done };
    // Adaptive: opening questions 20%, discovery coverage 80% (same rule as the server).
    const tDone = templates.filter((q) => answers[q.id]).length;
    const cov = DIMS.reduce((s, d) => s + (coverage[d.key] === "sufficient" ? 1 : coverage[d.key] === "partial" ? 0.5 : 0), 0) / DIMS.length;
    const pct = ai.phase === "complete" || !props.open ? 100 : Math.round((templates.length ? tDone / templates.length : 1) * 20 + cov * 80);
    return { by, pct, done };
  }, [questions, answers, adaptive, templates, coverage, ai.phase, props.open]);

  function saved(questionId: string, a: Omit<ChatAnswer, "rev">) {
    setAnswers((p) => ({ ...p, [questionId]: { ...a, rev: (p[questionId]?.rev ?? 0) + 1 } }));
    setEditing(null);
    // An edit after completion changes the answer set: the engine re-checks it (and may ask a clarification).
    if (adaptive && ai.phase === "complete") setAi((p) => ({ ...p, phase: "idle" }));
  }

  // Transcript: every answered question up to the current one, then the current question.
  const visible = questions.filter((q) => answers[q.id] || q.id === currentId);
  const openClars = clars.filter((c) => (c.status ?? "open") === "open");
  const finished = adaptive ? ai.phase === "complete" : !current && progress.done === questions.length;

  return (
    <div className="chat-wrap">
      <div className="chat-progress">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <strong>{progress.pct}% complete</strong>
          <span className="muted small">{progress.done} answered{adaptive ? "" : ` of ${questions.length}`}</span>
        </div>
        <div className="bar"><div style={{ width: `${progress.pct}%` }} /></div>
        <div className="sections">
          {Object.entries(SECTION).filter(([s]) => progress.by[s]).map(([s, meta]) => {
            const b = progress.by[s]!;
            return <span key={s} className={`badge ${b.done === b.total ? "ok" : ""}`}>{meta.n}. {meta.title} {Math.round((b.done / b.total) * 100)}%</span>;
          })}
          {adaptive && <span className={`badge ${ai.phase === "complete" ? "ok" : ""}`}>3. Your work</span>}
        </div>
        {adaptive && (
          <>
            <div className="dims" aria-label="Topics covered">
              {DIMS.map((d) => {
                const st = coverage[d.key] ?? "not_started";
                return <span key={d.key} className={`badge ${st === "sufficient" ? "ok" : st === "partial" ? "part" : ""}`}
                  title={st.replace("_", " ")}>{st === "sufficient" ? "✓ " : st === "partial" ? "◐ " : ""}{d.label}</span>;
              })}
            </div>
            <div className="ai-line" data-testid="ai-line">
              {ai.phase === "thinking" && "AI interviewer: analysing your answer…"}
              {ai.phase === "error" && <span style={{ color: "var(--danger)" }}>AI interviewer unavailable: {ai.message}</span>}
              {(ai.phase === "idle" || ai.phase === "complete") && ai.model && `AI interviewer: ${ai.model} · last reply received ${new Date().toLocaleTimeString()}`}
              {(ai.phase === "idle" && !ai.model) && (templates.every((q) => answers[q.id]) ? "AI interviewer: ready" : "AI interviewer starts after the opening questions")}
              {openClars.length > 0 && ` · ${openClars.length} answer${openClars.length > 1 ? "s" : ""} to clarify`}
            </div>
          </>
        )}
      </div>

      <div className="chat">
        <div className="bubble bot">
          {adaptive
            ? <>Hi {props.firstName}! First {templates.length} short questions about you and the company. Then an AI interviewer asks about your work, one question at a time, building on your answers. Answer in your own words — “I don&rsquo;t know” is always OK.</>
            : <>Hi {props.firstName}! I&rsquo;ll ask {questions.length} short questions in 3 parts. Answer in your own words — short answers are fine, and “I don&rsquo;t know” is always OK.</>}
        </div>
        {adaptive && props.aiProvider === "gemini_free" && (
          <div className="bubble bot small" data-testid="ai-notice">
            🔔 Please note: your answers are sent to Google&rsquo;s Gemini AI (free version) to choose the next question. Google may use them
            to improve its services, and people at Google may read them. Please don&rsquo;t type customers&rsquo; names, phone or account
            numbers, passwords or other private details — describe the work instead (for example “the customer’s address proof”).
          </div>
        )}
        {visible.map((q, i) => {
          const a = answers[q.id];
          const intro = i === 0 || visible[i - 1]!.scope !== q.scope ? SECTION[q.scope] : null;
          const clar = clars.find((c) => c.question_id === q.id);
          return (
            <div key={q.id}>
              {intro && <div className="section-divider">Part {intro.n} of 3 · {intro.title}<div className="muted small">{intro.intro}</div></div>}
              <div className={`bubble bot${clar ? " clar" : ""}`} data-ai={q.generatedBy === "ai" ? "1" : undefined}>
                {clar && <div className="clar-tag">Needs clarification</div>}
                {q.text}
                {q.help && <div className="muted small" style={{ marginTop: 4 }}>{q.help}</div>}
                {clar && <div className="why">Why: {clar.description}</div>}
                {!clar && q.reason && <div className="why">Why I&rsquo;m asking: {q.reason}{q.dimension && DIM_LABEL[q.dimension] ? ` · ${DIM_LABEL[q.dimension]}` : ""}</div>}
              </div>
              {a && q.id !== editing && (
                <div className="bubble me">
                  <span style={{ whiteSpace: "pre-wrap" }}>{shown(a)}</span>
                  <div className="meta">based on {BASIS[a.basis] ?? a.basis}{canAnswer && ai.phase !== "thinking" && <> · <button type="button" className="linkish" onClick={() => setEditing(q.id)}>edit</button></>}</div>
                </div>
              )}
            </div>
          );
        })}
        {adaptive && canAnswer && ai.phase === "thinking" && <div className="bubble bot thinking" role="status">Analysing your answer</div>}
        {adaptive && canAnswer && ai.phase === "error" && !editing && (
          <div className="bubble bot" role="alert" data-testid="ai-error">
            I couldn&rsquo;t get the next question from the AI interviewer: {ai.message?.replace(/\.?$/, ".")} Your answers are saved.
            <div style={{ marginTop: 10 }}><button type="button" onClick={() => void runTurn()}>Try again</button></div>
          </div>
        )}
        {finished && !editing && (
          props.open ? (
            <div className="bubble bot">
              {adaptive && ai.message ? `${ai.message} ` : ""}That&rsquo;s everything — thank you! Check your answers above (tap “edit” to change one), then press <strong>Submit</strong>.
              {props.canAnswer && (
                <div style={{ marginTop: 10 }}>
                  <button type="button" disabled={submitting}
                    onClick={() => startSubmit(() => submitInterview(props.companyId, props.assignmentId, props.sessionId))}>
                    {submitting ? "Submitting…" : "Submit my answers"}
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="bubble bot">✅ Submitted{props.submittedAt ? ` on ${props.submittedAt.slice(0, 10)}` : ""}. Thank you! We may come back with a few follow-up questions.</div>
          )
        )}
        {adaptive && !props.open && !finished && (
          <div className="bubble bot">✅ Submitted{props.submittedAt ? ` on ${props.submittedAt.slice(0, 10)}` : ""}. Thank you!</div>
        )}
        <div ref={end} />
      </div>

      {current && canAnswer && (
        <Composer key={current.id + (editing ? ":edit" : "")} q={current} existing={editing ? answers[current.id] ?? null : null}
          companyId={props.companyId} assignmentId={props.assignmentId} basis={basis} setBasis={setBasis}
          editing={!!editing} onCancel={() => setEditing(null)} onSaved={saved} />
      )}
    </div>
  );
}

function Composer(props: {
  q: ChatQuestion; existing: ChatAnswer | null; companyId: string; assignmentId: string; basis: string;
  setBasis: (b: string) => void; editing: boolean; onCancel: () => void; onSaved: (id: string, a: Omit<ChatAnswer, "rev">) => void;
}) {
  const { q } = props;
  const [text, setText] = useState(props.existing ? (props.existing.text ?? "") : (q.draft ?? ""));
  const [askWho, setAskWho] = useState(false);
  const [who, setWho] = useState("");
  const [error, setError] = useState("");
  const [saveState, setSaveState] = useState("");
  const [pending, start] = useTransition();
  const supabase = useRef<ReturnType<typeof createClient> | null>(null);

  // Autosave the typed text as a private draft (not while editing an already-saved answer).
  useEffect(() => {
    if (props.editing || !text.trim()) return;
    const t = setTimeout(() => {
      supabase.current ??= createClient();
      // Query builders run only when awaited/then-ed.
      void supabase.current.from("interview_answer_drafts").upsert(
        { company_id: props.companyId, question_id: q.id, draft_text: text, updated_at: new Date().toISOString() },
        { onConflict: "company_id,question_id" }).then(({ error }) => setSaveState(error ? "Draft not saved" : "Draft saved"));
    }, 700);
    return () => clearTimeout(t);
  }, [text, q.id, props.companyId, props.editing]);

  function send(kind: string, value: string, referred = "") {
    setError("");
    start(async () => {
      const r = await saveAnswer({
        companyId: props.companyId, assignmentId: props.assignmentId, questionId: q.id,
        kind, text: value, basis: props.basis, referredNote: referred, revisionReason: "",
      });
      if (!r.ok) { setError(r.error); return; }
      props.onSaved(q.id, { kind, text: value || null, basis: props.basis, referred: referred || null });
    });
  }

  return (
    <div className="composer">
      {error && <div className="notice error" style={{ margin: "0 0 8px" }}>{error}</div>}
      {q.answerType === "choice" && q.choices ? (
        <div className="chips">
          {q.choices.map((c) => <button key={c} type="button" className="chip" disabled={pending} onClick={() => send("answer", c)}>{c}</button>)}
        </div>
      ) : (
        <div className="row" style={{ alignItems: "flex-end", flexWrap: "nowrap" }}>
          <textarea aria-label="Your answer" value={text} onChange={(e) => setText(e.target.value)} placeholder="Type your answer…" rows={2}
            onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && text.trim()) send("answer", text.trim()); }} />
          <button type="button" disabled={pending || !text.trim()} onClick={() => send("answer", text.trim())}>{pending ? "…" : "Send"}</button>
        </div>
      )}
      {askWho ? (
        <div className="row" style={{ marginTop: 8, flexWrap: "nowrap" }}>
          <input aria-label="Who knows" value={who} onChange={(e) => setWho(e.target.value)} placeholder="Who knows? (name or role)" />
          <button type="button" disabled={pending || !who.trim()} onClick={() => send("refer_to_owner", "", who.trim())}>OK</button>
        </div>
      ) : (
        <div className="chips" style={{ marginTop: 8 }}>
          <button type="button" className="chip ghost" disabled={pending} onClick={() => send("unknown", "")}>I don&rsquo;t know</button>
          <button type="button" className="chip ghost" disabled={pending} onClick={() => send("not_applicable", "")}>Not applicable</button>
          <button type="button" className="chip ghost" disabled={pending} onClick={() => setAskWho(true)}>Someone else knows</button>
          {props.editing && <button type="button" className="chip ghost" onClick={props.onCancel}>Cancel edit</button>}
        </div>
      )}
      <label className="small muted" style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 8, fontWeight: 400 }}>
        <span style={{ marginRight: "auto" }}>{saveState}</span>
        My answer is based on
        <select value={props.basis} onChange={(e) => props.setBasis(e.target.value)} style={{ width: "auto", padding: "2px 6px" }}>
          {Object.entries(BASIS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </label>
    </div>
  );
}
