"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireMembership, explain } from "@/lib/session";

export type ActionResult = { ok: true } | { ok: false; error: string };

const KINDS = ["answer", "unknown", "not_applicable", "depends", "refer_to_owner", "deferred"] as const;
const BASES = ["direct", "hearsay", "assumed", "documented"] as const;
type Kind = (typeof KINDS)[number];
type Basis = (typeof BASES)[number];

export async function startInterview(companyId: string, assignmentId: string) {
  const { supabase } = await requireMembership(companyId);
  const { error } = await supabase.rpc("start_interview_session", { p_assignment: assignmentId });
  if (error) redirect(`/c/${companyId}/interviews/${assignmentId}?e=${encodeURIComponent(explain(error))}`);
  redirect(`/c/${companyId}/interviews/${assignmentId}`);
}

export async function saveAnswer(input: {
  companyId: string; assignmentId: string; questionId: string;
  kind: string; text: string; basis: string; referredNote: string; revisionReason: string; fromSuggestion?: boolean;
}): Promise<ActionResult> {
  const { supabase, membership } = await requireMembership(input.companyId);
  if (!KINDS.includes(input.kind as Kind) || !BASES.includes(input.basis as Basis)) return { ok: false, error: "Invalid choice." };
  const text = input.text.trim();
  if (input.kind === "answer" && !text) return { ok: false, error: "Type your answer, or tap “I don't know”." };
  if (input.kind === "depends" && !text) return { ok: false, error: "Explain what it depends on." };
  if (input.kind === "not_applicable" && !text) return { ok: false, error: "Tell us briefly why this does not apply to your work." };
  if (input.kind === "refer_to_owner" && !input.referredNote.trim())
    return { ok: false, error: "Tell us who knows (name or role)." };

  // Answers are append-only: a change is a new revision that supersedes the latest one and needs a reason.
  const { data: current } = await supabase
    .from("interview_current_answers")
    .select("id")
    .eq("company_id", input.companyId)
    .eq("question_id", input.questionId)
    .maybeSingle();
  const reason = input.revisionReason.trim() || "Changed by the respondent during the interview";
  const fromSuggestion = input.kind === "answer" && input.fromSuggestion === true;

  const { error } = await supabase.from("interview_answers").insert({
    company_id: input.companyId,
    question_id: input.questionId,
    answer_kind: input.kind as Kind,
    answer_text: input.kind === "deferred" ? null : text || null,
    from_suggestion: fromSuggestion,
    knowledge_basis: input.basis as Basis,
    referred_note: input.kind === "refer_to_owner" ? input.referredNote.trim() : null,
    answered_by_membership_id: membership.id,
    supersedes_answer_id: current?.id ?? null,
    revision_reason: current?.id ? reason : null,
  });
  if (error) return { ok: false, error: explain(error) };

  await supabase.from("interview_answer_drafts").delete().eq("company_id", input.companyId).eq("question_id", input.questionId);
  revalidatePath(`/c/${input.companyId}/interviews/${input.assignmentId}`);
  return { ok: true };
}

export async function submitInterview(companyId: string, assignmentId: string, sessionId: string) {
  const { supabase } = await requireMembership(companyId);
  const back = `/c/${companyId}/interviews/${assignmentId}`;
  const s = await supabase.from("interview_sessions").update({ status: "submitted" }).eq("id", sessionId).eq("company_id", companyId).select("id");
  if (s.error) redirect(`${back}?e=${encodeURIComponent(explain(s.error))}`);
  if (!s.data?.length) redirect(`${back}?e=${encodeURIComponent("This interview could not be submitted.")}`);
  const a = await supabase.from("interview_assignments").update({ status: "completed" }).eq("id", assignmentId).eq("company_id", companyId);
  if (a.error) redirect(`${back}?e=${encodeURIComponent(explain(a.error))}`);
  redirect(`${back}?submitted=1`);
}

/** "Ask a colleague" (D-085): a request in the Requests module linked to this question; the answer becomes "someone else knows". */
export async function askColleague(input: { companyId: string; assignmentId: string; questionId: string; helperId: string; note: string }): Promise<ActionResult> {
  const { supabase } = await requireMembership(input.companyId);
  if (!input.helperId) return { ok: false, error: "Choose the colleague who knows." };
  const { error } = await supabase.rpc("interview_ask_colleague", { p_company: input.companyId, p_question: input.questionId,
    p_helper: input.helperId, p_note: input.note.trim() || null });
  if (error) return { ok: false, error: explain(error) };
  revalidatePath(`/c/${input.companyId}/interviews/${input.assignmentId}`);
  return { ok: true };
}
