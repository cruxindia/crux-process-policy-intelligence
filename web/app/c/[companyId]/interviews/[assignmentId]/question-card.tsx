"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";
import { saveAnswer } from "./actions";

export type CurrentAnswer = {
  answer_kind: string; answer_text: string | null; knowledge_basis: string;
  referred_note: string | null; revision_no: number; answered_at: string;
} | null;

const KIND_LABEL: Record<string, string> = {
  answer: "Answer", unknown: "I don't know", not_applicable: "Not applicable",
  depends: "It depends (explain)", refer_to_owner: "Someone else should answer",
};
const BASIS_LABEL: Record<string, string> = {
  direct: "I do this / saw it myself", documented: "From a document or record",
  hearsay: "I was told by someone", assumed: "My assumption",
};

export function QuestionCard(props: {
  companyId: string; assignmentId: string; questionId: string; seq: number;
  question: string; help: string | null; draft: string | null; current: CurrentAnswer; editable: boolean;
}) {
  const { current, editable } = props;
  const [editing, setEditing] = useState(!current && editable);
  const [text, setText] = useState(props.draft ?? current?.answer_text ?? "");
  const [kind, setKind] = useState(current?.answer_kind ?? "answer");
  const [basis, setBasis] = useState(current?.knowledge_basis ?? "direct");
  const [referred, setReferred] = useState(current?.referred_note ?? "");
  const [reason, setReason] = useState("");
  const [status, setStatus] = useState<string>(props.draft ? "Draft restored" : "");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const supabase = useRef(createClient());

  // Autosave the text as a private draft (only the respondent can read it; it is never cited as a source).
  useEffect(() => {
    if (!editing) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      if (text === (props.draft ?? current?.answer_text ?? "")) return;
      const { error: e } = await supabase.current.from("interview_answer_drafts").upsert(
        { company_id: props.companyId, question_id: props.questionId, draft_text: text, updated_at: new Date().toISOString() },
        { onConflict: "company_id,question_id" },
      );
      setStatus(e ? "Draft not saved — check your connection" : `Draft saved ${new Date().toLocaleTimeString()}`);
    }, 800);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [text, editing, props.companyId, props.questionId, props.draft, current?.answer_text]);

  function onSave() {
    setError("");
    startTransition(async () => {
      const r = await saveAnswer({
        companyId: props.companyId, assignmentId: props.assignmentId, questionId: props.questionId,
        kind, text, basis, referredNote: referred, revisionReason: reason,
      });
      if (!r.ok) setError(r.error);
      else { setEditing(false); setReason(""); setStatus("Answer saved"); }
    });
  }

  return (
    <div className="card">
      <div className="q-head">
        <strong>{props.seq}. {props.question}</strong>
        {current ? <span className="badge ok">Answered{current.revision_no > 1 ? ` · rev ${current.revision_no}` : ""}</span>
                 : <span className="badge">Open</span>}
      </div>
      {props.help && <p className="muted small">{props.help}</p>}

      {!editing && current && (
        <>
          <p style={{ whiteSpace: "pre-wrap" }}>
            {current.answer_kind === "answer" || current.answer_kind === "depends" ? current.answer_text : KIND_LABEL[current.answer_kind]}
            {current.answer_kind === "refer_to_owner" && current.referred_note ? ` — ${current.referred_note}` : ""}
          </p>
          <p className="muted small">Basis: {BASIS_LABEL[current.knowledge_basis] ?? current.knowledge_basis}</p>
          {editable && <button className="secondary" type="button" onClick={() => setEditing(true)}>Change answer</button>}
        </>
      )}

      {editing && (
        <>
          <div className="grid2">
            <div>
              <label htmlFor={`k-${props.questionId}`}>Response</label>
              <select id={`k-${props.questionId}`} value={kind} onChange={(e) => setKind(e.target.value)}>
                {Object.entries(KIND_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor={`b-${props.questionId}`}>How do you know?</label>
              <select id={`b-${props.questionId}`} value={basis} onChange={(e) => setBasis(e.target.value)}>
                {Object.entries(BASIS_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
          </div>
          {kind !== "unknown" && kind !== "not_applicable" && kind !== "refer_to_owner" && (
            <>
              <label htmlFor={`t-${props.questionId}`}>Your answer</label>
              <textarea id={`t-${props.questionId}`} value={text} onChange={(e) => setText(e.target.value)} />
            </>
          )}
          {kind === "refer_to_owner" && (
            <>
              <label htmlFor={`r-${props.questionId}`}>Who should answer? (name or role)</label>
              <input id={`r-${props.questionId}`} value={referred} onChange={(e) => setReferred(e.target.value)} />
            </>
          )}
          {current && (
            <>
              <label htmlFor={`why-${props.questionId}`}>Reason for the change</label>
              <input id={`why-${props.questionId}`} value={reason} onChange={(e) => setReason(e.target.value)}
                     placeholder="e.g. I checked with the team; the turnaround is 48 hours, not 24" />
              <p className="muted small">Your earlier answer is kept in the history; this becomes the current one.</p>
            </>
          )}
          {error && <div className="notice error">{error}</div>}
          <div className="row" style={{ marginTop: 12 }}>
            <button type="button" onClick={onSave} disabled={pending}>{pending ? "Saving…" : "Save answer"}</button>
            {current && <button type="button" className="secondary" onClick={() => setEditing(false)}>Cancel</button>}
            <span className="muted small" aria-live="polite">{status}</span>
          </div>
        </>
      )}
    </div>
  );
}
