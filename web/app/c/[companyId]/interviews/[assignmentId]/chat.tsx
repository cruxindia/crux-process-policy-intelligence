"use client";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";
import { saveAnswer, submitInterview } from "./actions";

export type ChatQuestion = {
  id: string; seq: number; text: string; help: string | null; scope: string;
  answerType: string; choices: string[] | null; draft: string | null;
};
export type ChatAnswer = { kind: string; text: string | null; basis: string; referred: string | null; rev: number };

const SECTION: Record<string, { n: number; title: string; intro: string }> = {
  general: { n: 1, title: "About you", intro: "Let's start with a few questions about you and your role." },
  company_dna: { n: 2, title: "About CRUX", intro: "Next, tell us how you see the company." },
  process: { n: 3, title: "Your work", intro: "Finally, walk us through the main work you do, step by step." },
};
const KIND_TEXT: Record<string, string> = { unknown: "I don't know", not_applicable: "Not applicable to my work", refer_to_owner: "Someone else knows" };
const BASIS: Record<string, string> = { direct: "my own work", documented: "a document or record", hearsay: "what I was told", assumed: "my best guess" };

function shown(a: ChatAnswer) {
  if (a.kind === "answer" || a.kind === "depends") return a.text ?? "";
  return KIND_TEXT[a.kind] + (a.kind === "refer_to_owner" && a.referred ? ` — ${a.referred}` : "");
}

export function Chat(props: {
  companyId: string; assignmentId: string; sessionId: string; firstName: string;
  questions: ChatQuestion[]; answers: Record<string, ChatAnswer>; open: boolean; canAnswer: boolean; submittedAt: string | null;
}) {
  const { questions } = props;
  const [answers, setAnswers] = useState(props.answers);
  const [editing, setEditing] = useState<string | null>(null);
  const firstOpen = questions.find((q) => !answers[q.id])?.id ?? null;
  const currentId = editing ?? firstOpen;
  const current = questions.find((q) => q.id === currentId) ?? null;
  const [basis, setBasis] = useState("direct");
  const [submitting, startSubmit] = useTransition();
  const end = useRef<HTMLDivElement>(null);
  const canAnswer = props.open && props.canAnswer;

  // Keep the newest question in view.
  useEffect(() => { end.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [currentId]);

  const progress = useMemo(() => {
    const by: Record<string, { done: number; total: number }> = {};
    for (const q of questions) {
      by[q.scope] ??= { done: 0, total: 0 };
      by[q.scope]!.total++;
      if (answers[q.id]) by[q.scope]!.done++;
    }
    const done = Object.keys(answers).filter((k) => questions.some((q) => q.id === k)).length;
    return { by, pct: questions.length ? Math.round((done / questions.length) * 100) : 0, done };
  }, [questions, answers]);

  function saved(questionId: string, a: Omit<ChatAnswer, "rev">) {
    setAnswers((p) => ({ ...p, [questionId]: { ...a, rev: (p[questionId]?.rev ?? 0) + 1 } }));
    setEditing(null);
  }

  // Transcript: every answered question up to the current one, then the current question.
  const visible = questions.filter((q) => answers[q.id] || q.id === currentId);

  return (
    <div className="chat-wrap">
      <div className="chat-progress">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <strong>{progress.pct}% complete</strong>
          <span className="muted small">{progress.done} of {questions.length} answered</span>
        </div>
        <div className="bar"><div style={{ width: `${progress.pct}%` }} /></div>
        <div className="sections">
          {Object.entries(SECTION).filter(([s]) => progress.by[s]).map(([s, meta]) => {
            const b = progress.by[s]!;
            return <span key={s} className={`badge ${b.done === b.total ? "ok" : ""}`}>{meta.n}. {meta.title} {Math.round((b.done / b.total) * 100)}%</span>;
          })}
        </div>
      </div>

      <div className="chat">
        <div className="bubble bot">Hi {props.firstName}! I&rsquo;ll ask {questions.length} short questions in 3 parts. Answer in your own words — short answers are fine, and “I don&rsquo;t know” is always OK.</div>
        {visible.map((q, i) => {
          const a = answers[q.id];
          const intro = i === 0 || visible[i - 1]!.scope !== q.scope ? SECTION[q.scope] : null;
          return (
            <div key={q.id}>
              {intro && <div className="section-divider">Part {intro.n} of 3 · {intro.title}<div className="muted small">{intro.intro}</div></div>}
              <div className="bubble bot">{q.text}{q.help && <div className="muted small" style={{ marginTop: 4 }}>{q.help}</div>}</div>
              {a && q.id !== editing && (
                <div className="bubble me">
                  <span style={{ whiteSpace: "pre-wrap" }}>{shown(a)}</span>
                  <div className="meta">based on {BASIS[a.basis] ?? a.basis}{canAnswer && <> · <button type="button" className="linkish" onClick={() => setEditing(q.id)}>edit</button></>}</div>
                </div>
              )}
            </div>
          );
        })}
        {!current && progress.done === questions.length && (
          props.open ? (
            <div className="bubble bot">
              That&rsquo;s everything — thank you! Check your answers above (tap “edit” to change one), then press <strong>Submit</strong>.
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
