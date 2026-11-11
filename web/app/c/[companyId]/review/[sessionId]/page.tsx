import Link from "next/link";
import { notFound } from "next/navigation";
import { requireMembership } from "@/lib/session";
import { memberNames, fmtDate } from "@/lib/names";
import { askFollowUp, discardKnowledge, recordKnowledge, setReview, verifyKnowledge } from "./actions";

const KIND: Record<string, string> = { unknown: "I don't know", not_applicable: "Not applicable", refer_to_owner: "Someone else knows", depends: "It depends" };
const BASIS: Record<string, string> = { direct: "own work", documented: "a document", hearsay: "told by others", assumed: "a guess" };
const TYPES: [string, string][] = [["fact","Fact"],["responsibility","Responsibility"],["process_step","Process step"],["decision_rule","Decision rule"],["system","System / tool"],["record","Record / report"],["metric","Metric"],["sla","SLA / TAT"],["exception","Exception"],["pain_point","Pain point"],["risk","Risk"],["control","Control / check"],["policy_rule","Policy rule"],["dependency","Dependency / hand-off"],["improvement_idea","Improvement idea"],["definition","Definition"]];
const SUGGEST: Record<string, string> = { "self.responsibilities": "responsibility", "self.tools": "system", "company.documents": "policy_rule", "company.boundaries": "control", "process.steps": "process_step", "process.decisions": "decision_rule", "process.handoffs": "dependency", "process.tat": "sla", "process.exceptions": "exception", "process.records": "record", "process.improvements": "improvement_idea", "process.trigger": "process_step", "process.inputs": "dependency" };
const STATUS: Record<string, string> = { draft: "Draft", submitted: "Submitted", under_review: "Under review", verified: "Verified", approved: "Approved", retired: "Discarded", rejected: "Rejected", disputed: "Disputed" };

export default async function ReviewSession({ params, searchParams }: {
  params: Promise<{ companyId: string; sessionId: string }>; searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { companyId, sessionId } = await params;
  const sp = await searchParams;
  const { supabase, permissions } = await requireMembership(companyId);
  if (!permissions.has("interview.review")) notFound();

  const { data: session } = await supabase.from("interview_sessions")
    .select("id, status, submitted_at, reviewed_at, assignment_id, interview_assignments(id, respondent_membership_id, department_id, interview_campaigns(name))")
    .eq("company_id", companyId).eq("id", sessionId).maybeSingle();
  if (!session?.interview_assignments) notFound();
  const a = session.interview_assignments;
  const [{ names }, { data: qs }, { data: procs }] = await Promise.all([
    memberNames(supabase, companyId),
    supabase.from("interview_questions").select("id, seq, question_text, field_key").eq("company_id", companyId).eq("session_id", sessionId).order("seq"),
    supabase.from("processes").select("id, code, name").eq("company_id", companyId).order("code"),
  ]);
  const qids = (qs ?? []).map((q) => q.id);
  const { data: answers } = qids.length ? await supabase.from("interview_current_answers")
    .select("id, question_id, answer_kind, answer_text, knowledge_basis, referred_note, revision_no").eq("company_id", companyId).in("question_id", qids) : { data: [] };
  const aids = (answers ?? []).map((x) => x.id!).filter(Boolean);
  const [{ data: sources }, { data: followups }] = await Promise.all([
    aids.length ? supabase.from("knowledge_sources")
      .select("interview_answer_id, knowledge_records!knowledge_sources_company_id_knowledge_record_id_fkey(id, record_code, title, record_type, lifecycle_status)").eq("company_id", companyId).in("interview_answer_id", aids)
      : Promise.resolve({ data: [] }),
    supabase.from("clarification_tasks").select("id, code, question_text, status, context_text").eq("company_id", companyId)
      .eq("assignee_membership_id", a.respondent_membership_id).order("created_at"),
  ]);
  const ansByQ = new Map((answers ?? []).map((x) => [x.question_id!, x]));
  const krByAnswer = new Map<string, NonNullable<NonNullable<typeof sources>[number]["knowledge_records"]>[]>();
  for (const s of sources ?? []) if (s.interview_answer_id && s.knowledge_records) {
    krByAnswer.set(s.interview_answer_id, [...(krByAnswer.get(s.interview_answer_id) ?? []), s.knowledge_records]);
  }
  const person = names.get(a.respondent_membership_id) ?? "Respondent";
  const canEdit = permissions.has("knowledge.edit");
  const canVerify = permissions.has("knowledge.verify");
  const canAsk = permissions.has("clarification.create");
  const open = ["in_progress", "reopened"].includes(session.status);

  return (
    <>
      <p id="top"><Link href={`/c/${companyId}/review`}>← Review answers</Link></p>
      <h1>{person}</h1>
      <p className="muted">{a.interview_campaigns?.name} · {open ? "still answering" : `submitted ${fmtDate(session.submitted_at)}`} · status: {session.status.replace("_", " ")}</p>
      {sp.e && <div className="notice error">{sp.e}</div>}
      {sp.ok && <div className="notice ok">{sp.ok}</div>}
      <div className="row">
        {["submitted", "review_pending"].includes(session.status) &&
          <form action={setReview.bind(null, companyId, sessionId, a.id, "reviewed")}><button type="submit">Mark review complete</button></form>}
        {["submitted", "review_pending", "reviewed"].includes(session.status) &&
          <form action={setReview.bind(null, companyId, sessionId, a.id, "reopened")}><button type="submit" className="secondary">Send back to {person.split(" ")[0]}</button></form>}
      </div>

      <h2 id="a">Answers</h2>
      {(qs ?? []).map((q) => {
        const ans = ansByQ.get(q.id);
        const krs = ans?.id ? krByAnswer.get(ans.id) ?? [] : [];
        const text = ans ? (ans.answer_kind === "answer" || ans.answer_kind === "depends" ? ans.answer_text : KIND[ans.answer_kind ?? ""] + (ans.referred_note ? ` — ${ans.referred_note}` : "")) : null;
        return (
          <div key={q.id} className="card">
            <div className="muted small">Q{q.seq}</div>
            <strong>{q.question_text}</strong>
            {ans ? (
              <p style={{ whiteSpace: "pre-wrap", margin: "6px 0" }}>{text}
                <span className="muted small"> · based on {BASIS[ans.knowledge_basis ?? ""] ?? ans.knowledge_basis}{(ans.revision_no ?? 1) > 1 ? ` · edited (rev ${ans.revision_no})` : ""}</span></p>
            ) : <p className="muted">No answer yet.</p>}

            {krs.map((k) => (
              <div key={k.id} className="row small" style={{ gap: 8, margin: "4px 0" }}>
                <span className={`badge ${k.lifecycle_status === "verified" ? "ok" : k.lifecycle_status === "draft" ? "warn" : ""}`}>{STATUS[k.lifecycle_status] ?? k.lifecycle_status}</span>
                <span>{k.record_code} · {k.title}</span>
                {canVerify && ["draft", "submitted", "under_review"].includes(k.lifecycle_status) &&
                  <form action={verifyKnowledge.bind(null, companyId, sessionId, k.id)}><button type="submit" className="secondary" style={{ padding: "2px 8px" }}>Verify</button></form>}
                {canEdit && k.lifecycle_status === "draft" &&
                  <form action={discardKnowledge.bind(null, companyId, sessionId, k.id)}><button type="submit" className="secondary" style={{ padding: "2px 8px" }}>Discard</button></form>}
              </div>
            ))}

            {ans?.id && ans.answer_kind !== "not_applicable" && (canEdit || canAsk) && (
              <details style={{ marginTop: 6 }}>
                <summary className="small">Record as knowledge / ask a follow-up</summary>
                {canEdit && (
                  <form action={recordKnowledge.bind(null, companyId, sessionId, ans.id, a.department_id)} className="grid2" style={{ marginTop: 8 }}>
                    <div><label>Type</label>
                      <select name="record_type" defaultValue={SUGGEST[q.field_key] ?? "fact"}>{TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
                    <div><label>Process (optional)</label>
                      <select name="process_id" defaultValue=""><option value="">—</option>{(procs ?? []).map((p) => <option key={p.id} value={p.id}>{p.code} · {p.name}</option>)}</select></div>
                    <div style={{ gridColumn: "1 / -1" }}><label>Title</label><input name="title" required defaultValue={q.question_text.replace(/\?$/, "").slice(0, 80)} /></div>
                    <div style={{ gridColumn: "1 / -1" }}><label>Statement (as the person said it; edit for clarity, not meaning)</label>
                      <textarea name="claim_text" required defaultValue={ans.answer_text ?? ""} /></div>
                    <input type="hidden" name="locator" value={`Q${q.seq} rev ${ans.revision_no ?? 1}`} />
                    <div><button type="submit">Save as draft knowledge</button></div>
                  </form>
                )}
                {canAsk && (
                  <form action={askFollowUp.bind(null, companyId, sessionId, a.respondent_membership_id, a.department_id, q.question_text)} className="grid2" style={{ marginTop: 10 }}>
                    <input type="hidden" name="idem" value={`followup:${ans.id}:${crypto.randomUUID()}`} />
                    <div style={{ gridColumn: "1 / -1" }}><label>Follow-up question to {person.split(" ")[0]}</label><textarea name="question" required placeholder="e.g. How many cases a day? Who approves above the limit?" /></div>
                    <div><label>Reply by (optional)</label><input type="date" name="due_on" /></div>
                    <div style={{ alignSelf: "end" }}><button type="submit" className="secondary">Send follow-up</button></div>
                  </form>
                )}
              </details>
            )}
          </div>
        );
      })}

      <h2>Follow-up questions to {person.split(" ")[0]}</h2>
      {!followups?.length ? <p className="muted small">None yet.</p> : (
        <ul>{followups.map((t) => <li key={t.id}><Link href={`/c/${companyId}/requests/${t.id}`}>{t.code}</Link> — {t.question_text} <span className="badge">{t.status.replace("_", " ")}</span></li>)}</ul>
      )}
    </>
  );
}
