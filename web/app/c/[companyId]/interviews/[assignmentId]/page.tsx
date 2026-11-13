import Link from "next/link";
import { notFound } from "next/navigation";
import { requireMembership } from "@/lib/session";
import { memberNames } from "@/lib/names";
import { AutoStart } from "./auto-start";
import { startInterview } from "./actions";
import { Chat, type ChatAnswer, type ChatQuestion, type Clarification } from "./chat";
import { DiscoveryChat, type DAnswer, type DHelp, type DProcess, type DQuestion, type DState } from "./discovery-chat";

export default async function InterviewPage({ params, searchParams }: {
  params: Promise<{ companyId: string; assignmentId: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { companyId, assignmentId } = await params;
  const sp = await searchParams;
  const { supabase, membership, userId } = await requireMembership(companyId);

  const { data: assignment } = await supabase
    .from("interview_assignments")
    .select("id, status, respondent_membership_id, interview_campaigns(name, interview_mode, ai_provider)")
    .eq("company_id", companyId).eq("id", assignmentId).maybeSingle();
  if (!assignment) notFound();
  const isRespondent = assignment.respondent_membership_id === membership.id;

  const { data: sessions } = await supabase.from("interview_sessions").select("id, status, submitted_at")
    .eq("company_id", companyId).eq("assignment_id", assignmentId).order("started_at", { ascending: false }).limit(1);
  const session = sessions?.[0];

  if (!session && assignment.interview_campaigns?.interview_mode === "discovery") {
    // Master Corrective Prompt v2.0 home: nothing to choose — one button starts the conversation.
    return (
      <div className="chat-page welcome">
        {sp.e && <div className="notice error">{sp.e}</div>}
        <h1>Let&rsquo;s understand the work you do.</h1>
        <p>I&rsquo;ll guide you through a conversation about your role, your responsibilities and the work you handle every day. You don&rsquo;t need to
          prepare documents or know how to describe a “process” — just explain your work naturally and I&rsquo;ll organise it for you.</p>
        <p className="muted small">It usually takes 20–40 minutes. You can stop at any time and continue later exactly where you left off.</p>
        {isRespondent ? (
          <form action={startInterview.bind(null, companyId, assignmentId)}><button type="submit" className="big">Start conversation</button></form>
        ) : <p className="muted">Not started yet.</p>}
      </div>
    );
  }
  if (!session) {
    return (
      <div className="chat-page">
        <h1>{assignment.interview_campaigns?.name ?? "Interview"}</h1>
        {sp.e && <div className="notice error">{sp.e}</div>}
        {isRespondent && !sp.e ? <AutoStart companyId={companyId} assignmentId={assignmentId} /> : !isRespondent && <p className="muted">Not started yet.</p>}
      </div>
    );
  }

  const open = ["in_progress", "reopened"].includes(session.status);
  if (assignment.interview_campaigns?.interview_mode === "discovery") {
    const [{ data: dq }, { data: dp }, { data: procs }, { data: me }, { members }, { data: help }] = await Promise.all([
      supabase.from("interview_questions").select("id, seq, question_text, generated_by, rationale, field_key, suggestions").eq("company_id", companyId).eq("session_id", session.id).order("seq"),
      supabase.from("discovery_profiles").select("stage, focus_process_key, inventory_confirmed, profile, responsibilities").eq("company_id", companyId).eq("session_id", session.id).maybeSingle(),
      supabase.from("discovered_processes").select("id, process_key, name, status, completeness, coverage, flow, flow_version, involvement, frequency, departments, purpose")
        .eq("company_id", companyId).eq("session_id", session.id).order("created_at"),
      supabase.from("user_profiles").select("display_name").eq("id", userId).maybeSingle(),
      isRespondent ? memberNames(supabase, companyId) : Promise.resolve({ members: [] as { id: string; name: string; status: string }[] }),
      supabase.rpc("interview_help_replies", { p_company: companyId, p_session: session.id }),
    ]);
    const qids = (dq ?? []).map((q) => q.id);
    const [{ data: dans }, { data: ddrafts }] = await Promise.all([
      qids.length ? supabase.from("interview_current_answers").select("question_id, answer_kind, answer_text, referred_note, from_suggestion").eq("company_id", companyId).in("question_id", qids)
        : Promise.resolve({ data: [] as { question_id: string | null; answer_kind: string | null; answer_text: string | null; referred_note: string | null; from_suggestion: boolean | null }[] }),
      isRespondent && qids.length ? supabase.from("interview_answer_drafts").select("question_id, draft_text").eq("company_id", companyId).in("question_id", qids)
        : Promise.resolve({ data: [] as { question_id: string; draft_text: string | null }[] }),
    ]);
    const dDraft = new Map((ddrafts ?? []).map((d) => [d.question_id, d.draft_text]));
    const dQuestions: DQuestion[] = (dq ?? []).map((q) => ({ id: q.id, seq: q.seq, text: q.question_text, reason: q.rationale, generatedBy: q.generated_by,
      processKey: q.field_key.startsWith("ai.process.") ? q.field_key.slice(11) : null, draft: dDraft.get(q.id) ?? null, suggestions: q.suggestions ?? [] }));
    const dAnswers: Record<string, DAnswer> = {};
    for (const a of dans ?? []) if (a.question_id) dAnswers[a.question_id] = { kind: a.answer_kind ?? "answer", text: a.answer_text, referred: a.referred_note, fromSuggestion: !!a.from_suggestion };
    const profile: Record<string, string> = { ...(me?.display_name ? { name: me.display_name } : {}) };
    for (const [k, v] of Object.entries((dp?.profile ?? {}) as Record<string, { value?: string }>)) if (v?.value) profile[k] = v.value;
    const state: DState = {
      stage: dp?.stage ?? "person", focus_process_key: dp?.focus_process_key ?? null, inventory_confirmed: !!dp?.inventory_confirmed, profile,
      responsibilities: (Array.isArray(dp?.responsibilities) ? dp.responsibilities : []) as DState["responsibilities"],
      processes: (procs ?? []).map((p) => ({ ...p, key: p.process_key, coverage: (p.coverage ?? {}) as Record<string, string>,
        flow: (p.flow ?? null) as DProcess["flow"] })) as DProcess[],
    };
    return (
      <div className="chat-page wide">
        {!isRespondent && <p><Link href={`/c/${companyId}/discovery`}>← Back to discovery</Link></p>}
        {sp.e && <div className="notice error">{sp.e}</div>}
        <DiscoveryChat companyId={companyId} assignmentId={assignmentId} sessionId={session.id} questions={dQuestions} answers={dAnswers} state={state}
          open={open} canAnswer={isRespondent} submittedAt={session.submitted_at} aiProvider={assignment.interview_campaigns?.ai_provider ?? "gemini_free"}
          members={members.filter((m) => m.id !== membership.id && m.status === "active").map((m) => ({ id: m.id, name: m.name }))}
          help={((help ?? []) as { question_id: string; helper_role: string; task_status: string; reply: string | null }[]).map((h): DHelp => ({ questionId: h.question_id, role: h.helper_role, status: h.task_status, reply: h.reply }))} />
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

  return (
    <div className="chat-page">
      {!isRespondent && <p><Link href={`/c/${companyId}/discovery`}>← Back to discovery</Link></p>}
      {sp.e && <div className="notice error">{sp.e}</div>}
      <Chat companyId={companyId} assignmentId={assignmentId} sessionId={session.id}
        firstName={(me?.display_name ?? "there").split(" ")[0] ?? "there"}
        questions={questions} answers={answers} open={open} canAnswer={isRespondent} submittedAt={session.submitted_at}
        adaptive={adaptive} aiProvider={assignment.interview_campaigns?.ai_provider ?? null} coverage={Object.fromEntries((cov ?? []).map((c) => [c.dimension, c.status]))} clarifications={(clar ?? []) as Clarification[]} />
    </div>
  );
}
