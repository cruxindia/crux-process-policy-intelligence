import Link from "next/link";
import { notFound } from "next/navigation";
import { requireMembership } from "@/lib/session";
import { startInterview, submitInterview } from "./actions";
import { QuestionCard, type CurrentAnswer } from "./question-card";

export default async function InterviewPage({ params, searchParams }: {
  params: Promise<{ companyId: string; assignmentId: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { companyId, assignmentId } = await params;
  const sp = await searchParams;
  const { supabase, membership } = await requireMembership(companyId);

  const { data: assignment } = await supabase
    .from("interview_assignments")
    .select("id, status, respondent_membership_id, interview_campaigns(name, purpose), departments(name), processes(code, name)")
    .eq("company_id", companyId).eq("id", assignmentId).maybeSingle();
  if (!assignment) notFound();
  const isRespondent = assignment.respondent_membership_id === membership.id;

  const { data: sessions } = await supabase
    .from("interview_sessions").select("id, status, started_at, submitted_at")
    .eq("company_id", companyId).eq("assignment_id", assignmentId).order("started_at", { ascending: false }).limit(1);
  const session = sessions?.[0];
  const open = !!session && ["in_progress", "reopened"].includes(session.status);

  const scope = assignment.processes ? `Process ${assignment.processes.code} · ${assignment.processes.name}` : `Department · ${assignment.departments?.name ?? ""}`;

  if (!session) {
    return (
      <>
        <p><Link href={`/c/${companyId}`}>← Back</Link></p>
        <h1>{assignment.interview_campaigns?.name ?? "Interview"}</h1>
        <p className="muted">{scope}</p>
        {assignment.interview_campaigns?.purpose && <p>{assignment.interview_campaigns.purpose}</p>}
        {sp.e && <div className="notice error">{sp.e}</div>}
        <div className="card">
          <p>Answer from your own experience. “I don&rsquo;t know” and “someone else should answer” are valid answers — please don&rsquo;t guess.
             Your answers are saved as you go, and you can come back later.</p>
          <p className="muted small">Your answers are reviewed before anything becomes company knowledge.</p>
          {isRespondent
            ? <form action={startInterview.bind(null, companyId, assignmentId)}><button type="submit">Start interview</button></form>
            : <p className="muted">Only the assigned person can start this interview.</p>}
        </div>
      </>
    );
  }

  const { data: questions } = await supabase.from("interview_questions")
    .select("id, seq, question_text, question_templates(help_text)")
    .eq("company_id", companyId).eq("session_id", session.id).order("seq");
  const ids = (questions ?? []).map((q) => q.id);
  const [{ data: answers }, { data: drafts }] = ids.length ? await Promise.all([
    supabase.from("interview_current_answers")
      .select("question_id, answer_kind, answer_text, knowledge_basis, referred_note, revision_no, answered_at")
      .eq("company_id", companyId).in("question_id", ids),
    isRespondent
      ? supabase.from("interview_answer_drafts").select("question_id, draft_text").eq("company_id", companyId).in("question_id", ids)
      : Promise.resolve({ data: [] as { question_id: string; draft_text: string | null }[] }),
  ]) : [{ data: [] }, { data: [] }];
  const qIds = new Set(ids);
  const answerBy = new Map((answers ?? []).filter((a) => a.question_id && qIds.has(a.question_id)).map((a) => [a.question_id!, a]));
  const draftBy = new Map((drafts ?? []).filter((d) => qIds.has(d.question_id)).map((d) => [d.question_id, d.draft_text]));
  const answered = answerBy.size;
  const total = questions?.length ?? 0;

  return (
    <>
      <p><Link href={`/c/${companyId}`}>← Back</Link></p>
      <h1>{assignment.interview_campaigns?.name ?? "Interview"}</h1>
      <p className="muted">{scope} · {answered} of {total} answered · {open ? "in progress" : `submitted ${session.submitted_at?.slice(0, 10) ?? ""}`}</p>
      {sp.e && <div className="notice error">{sp.e}</div>}
      {sp.submitted && <div className="notice ok">Submitted. Thank you — a reviewer will check your answers and may ask follow-up questions.</div>}
      {total === 0 && <div className="notice">No questions were generated. Ask the discovery lead to load the question set, then reopen this interview.</div>}

      {questions?.map((q) => {
        const a = answerBy.get(q.id);
        const current: CurrentAnswer = a ? {
          answer_kind: a.answer_kind ?? "answer", answer_text: a.answer_text, knowledge_basis: a.knowledge_basis ?? "direct",
          referred_note: a.referred_note, revision_no: a.revision_no ?? 1, answered_at: a.answered_at ?? "",
        } : null;
        return (
          <QuestionCard key={q.id} companyId={companyId} assignmentId={assignmentId} questionId={q.id} seq={q.seq}
            question={q.question_text} help={q.question_templates?.help_text ?? null}
            draft={draftBy.get(q.id) ?? null} current={current} editable={open && isRespondent} />
        );
      })}

      {open && isRespondent && total > 0 && (
        <div className="card">
          <p>{answered < total ? `${total - answered} question(s) have no answer yet. You can still submit; unanswered questions will be followed up.` : "All questions answered."}</p>
          <form action={submitInterview.bind(null, companyId, assignmentId, session.id)}>
            <button type="submit">Submit interview</button>
          </form>
        </div>
      )}
    </>
  );
}
