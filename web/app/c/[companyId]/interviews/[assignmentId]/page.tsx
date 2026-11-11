import Link from "next/link";
import { notFound } from "next/navigation";
import { requireMembership } from "@/lib/session";
import { AutoStart } from "./auto-start";
import { Chat, type ChatAnswer, type ChatQuestion, type Clarification } from "./chat";

export default async function InterviewPage({ params, searchParams }: {
  params: Promise<{ companyId: string; assignmentId: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { companyId, assignmentId } = await params;
  const sp = await searchParams;
  const { supabase, membership, userId } = await requireMembership(companyId);

  const { data: assignment } = await supabase
    .from("interview_assignments")
    .select("id, status, respondent_membership_id, interview_campaigns(name, interview_mode)")
    .eq("company_id", companyId).eq("id", assignmentId).maybeSingle();
  if (!assignment) notFound();
  const isRespondent = assignment.respondent_membership_id === membership.id;

  const { data: sessions } = await supabase.from("interview_sessions").select("id, status, submitted_at")
    .eq("company_id", companyId).eq("assignment_id", assignmentId).order("started_at", { ascending: false }).limit(1);
  const session = sessions?.[0];

  if (!session) {
    return (
      <div className="chat-page">
        <h1>{assignment.interview_campaigns?.name ?? "Interview"}</h1>
        {sp.e && <div className="notice error">{sp.e}</div>}
        {isRespondent && !sp.e ? <AutoStart companyId={companyId} assignmentId={assignmentId} /> : !isRespondent && <p className="muted">Not started yet.</p>}
      </div>
    );
  }

  const { data: qs } = await supabase.from("interview_questions")
    .select("id, seq, question_text, generated_by, rationale, field_key, question_templates(help_text, scope_type, answer_type, choices)")
    .eq("company_id", companyId).eq("session_id", session.id).order("seq");
  const ids = (qs ?? []).map((q) => q.id);
  const [{ data: ans }, { data: drafts }, { data: me }] = await Promise.all([
    ids.length ? supabase.from("interview_current_answers")
      .select("question_id, answer_kind, answer_text, knowledge_basis, referred_note, revision_no")
      .eq("company_id", companyId).in("question_id", ids) : Promise.resolve({ data: [] }),
    isRespondent && ids.length ? supabase.from("interview_answer_drafts").select("question_id, draft_text")
      .eq("company_id", companyId).in("question_id", ids) : Promise.resolve({ data: [] as { question_id: string; draft_text: string | null }[] }),
    supabase.from("user_profiles").select("display_name").eq("id", userId).maybeSingle(),
  ]);
  const adaptive = assignment.interview_campaigns?.interview_mode === "adaptive";
  const [{ data: cov }, { data: clar }] = adaptive ? await Promise.all([
    supabase.from("interview_dimension_coverage").select("dimension, status").eq("company_id", companyId).eq("session_id", session.id),
    supabase.from("interview_clarifications").select("id, description, status, question_id").eq("company_id", companyId).eq("session_id", session.id).order("created_at"),
  ]) : [{ data: [] as { dimension: string; status: string }[] }, { data: [] as Clarification[] }];
  const draftBy = new Map((drafts ?? []).map((d) => [d.question_id, d.draft_text]));
  const questions: ChatQuestion[] = (qs ?? []).map((q) => ({
    id: q.id, seq: q.seq, text: q.question_text, help: q.question_templates?.help_text ?? null,
    scope: q.generated_by === "ai" ? "ai" : q.question_templates?.scope_type ?? "general", answerType: q.question_templates?.answer_type ?? "text",
    generatedBy: q.generated_by, reason: q.generated_by === "ai" ? q.rationale : null,
    dimension: q.field_key.startsWith("ai.") ? q.field_key.slice(3) : null,
    choices: Array.isArray(q.question_templates?.choices) ? (q.question_templates!.choices as string[]) : null,
    draft: draftBy.get(q.id) ?? null,
  }));
  const answers: Record<string, ChatAnswer> = {};
  for (const a of ans ?? []) if (a.question_id) answers[a.question_id] = {
    kind: a.answer_kind ?? "answer", text: a.answer_text, basis: a.knowledge_basis ?? "direct", referred: a.referred_note, rev: a.revision_no ?? 1,
  };
  const open = ["in_progress", "reopened"].includes(session.status);

  return (
    <div className="chat-page">
      {!isRespondent && <p><Link href={`/c/${companyId}/discovery`}>← Back to discovery</Link></p>}
      {sp.e && <div className="notice error">{sp.e}</div>}
      <Chat companyId={companyId} assignmentId={assignmentId} sessionId={session.id}
        firstName={(me?.display_name ?? "there").split(" ")[0] ?? "there"}
        questions={questions} answers={answers} open={open} canAnswer={isRespondent} submittedAt={session.submitted_at}
        adaptive={adaptive} coverage={Object.fromEntries((cov ?? []).map((c) => [c.dimension, c.status]))} clarifications={(clar ?? []) as Clarification[]} />
    </div>
  );
}
