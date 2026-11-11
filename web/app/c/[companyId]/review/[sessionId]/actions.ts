"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireMembership, explain } from "@/lib/session";

const s = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const TYPES = ["fact","responsibility","process_step","decision_rule","system","record","metric","sla","exception","pain_point","risk","control","policy_rule","dependency","improvement_idea","definition"] as const;
type RecordType = (typeof TYPES)[number];
function back(c: string, sid: string, q: string): never { redirect(`/c/${c}/review/${sid}?${q}#${q.startsWith("e=") ? "top" : "a"}`); }

export async function recordKnowledge(companyId: string, sessionId: string, answerId: string, departmentId: string, f: FormData) {
  const { supabase } = await requireMembership(companyId);
  const type = s(f, "record_type") as RecordType;
  if (!TYPES.includes(type)) back(companyId, sessionId, "e=" + encodeURIComponent("Choose a type."));
  const { data: kr, error } = await supabase.from("knowledge_records").insert({
    company_id: companyId, record_type: type, title: s(f, "title"), claim_text: s(f, "claim_text"),
    department_id: departmentId, process_id: s(f, "process_id") || null, claim_origin: "employee_statement", state_kind: "as_is",
  }).select("id").single();
  if (error || !kr) back(companyId, sessionId, "e=" + encodeURIComponent(explain(error)));
  const { error: e2 } = await supabase.from("knowledge_sources").insert({
    company_id: companyId, knowledge_record_id: kr.id, source_type: "interview_answer", interview_answer_id: answerId, relation: "supports",
    locator: s(f, "locator") || null,
  });
  if (e2) back(companyId, sessionId, "e=" + encodeURIComponent("Saved as draft, but the source link failed: " + explain(e2)));
  revalidatePath(`/c/${companyId}/review/${sessionId}`);
  back(companyId, sessionId, "ok=" + encodeURIComponent("Saved as draft knowledge, linked to the answer."));
}

/** Verify: draft → submitted → under review → verified. The database checks the source link and that a human with knowledge.verify does it. */
export async function verifyKnowledge(companyId: string, sessionId: string, recordId: string) {
  const { supabase } = await requireMembership(companyId);
  for (const status of ["submitted", "under_review", "verified"] as const) {
    const { data: cur } = await supabase.from("knowledge_records").select("lifecycle_status").eq("company_id", companyId).eq("id", recordId).single();
    if (cur?.lifecycle_status === "verified") break;
    if (status === "submitted" && cur?.lifecycle_status !== "draft") continue;
    if (status === "under_review" && cur?.lifecycle_status !== "submitted") continue;
    const { error } = await supabase.from("knowledge_records").update({ lifecycle_status: status }).eq("company_id", companyId).eq("id", recordId);
    if (error) back(companyId, sessionId, "e=" + encodeURIComponent(explain(error)));
  }
  revalidatePath(`/c/${companyId}/review/${sessionId}`);
  back(companyId, sessionId, "ok=" + encodeURIComponent("Verified."));
}

export async function discardKnowledge(companyId: string, sessionId: string, recordId: string) {
  const { supabase } = await requireMembership(companyId);
  const { error } = await supabase.from("knowledge_records").update({ lifecycle_status: "retired" }).eq("company_id", companyId).eq("id", recordId);
  if (error) back(companyId, sessionId, "e=" + encodeURIComponent(explain(error)));
  revalidatePath(`/c/${companyId}/review/${sessionId}`);
  back(companyId, sessionId, "ok=" + encodeURIComponent("Draft discarded (kept in history)."));
}

export async function askFollowUp(companyId: string, sessionId: string, respondentId: string, departmentId: string, questionText: string, f: FormData) {
  const { supabase, membership } = await requireMembership(companyId);
  const q = s(f, "question");
  if (!q) back(companyId, sessionId, "e=" + encodeURIComponent("Type the follow-up question."));
  const due = s(f, "due_on");
  const { error } = await supabase.from("clarification_tasks").insert({
    company_id: companyId, requesting_department_id: departmentId, assignee_department_id: departmentId,
    assignee_membership_id: respondentId, question_text: q, context_text: `Follow-up on your interview answer to: “${questionText}”`,
    due_at: due ? new Date(due + "T18:00:00+05:30").toISOString() : null, status: "assigned",
    idempotency_key: s(f, "idem") || null, requester_membership_id: membership.id, // the database also sets this to the caller
  });
  if (error && error.code !== "23505") back(companyId, sessionId, "e=" + encodeURIComponent(explain(error)));
  revalidatePath(`/c/${companyId}/review/${sessionId}`);
  back(companyId, sessionId, "ok=" + encodeURIComponent("Follow-up question sent. They will see it when they sign in."));
}

export async function setReview(companyId: string, sessionId: string, assignmentId: string, to: "reviewed" | "reopened") {
  const { supabase } = await requireMembership(companyId);
  const { data: cur } = await supabase.from("interview_sessions").select("status").eq("company_id", companyId).eq("id", sessionId).single();
  // Allowed by the session state machine: submitted→review_pending→reviewed; submitted/review_pending/reviewed→reopened.
  const path = to === "reviewed"
    ? (cur?.status === "submitted" ? ["review_pending", "reviewed"] : cur?.status === "review_pending" ? ["reviewed"] : [])
    : (["submitted", "review_pending", "reviewed"].includes(cur?.status ?? "") ? ["reopened"] : []);
  if (!path.length) back(companyId, sessionId, "e=" + encodeURIComponent("Nothing to change for this interview's current status."));
  for (const status of path) {
    const { error } = await supabase.from("interview_sessions").update({ status: status as "reviewed" }).eq("company_id", companyId).eq("id", sessionId);
    if (error) back(companyId, sessionId, "e=" + encodeURIComponent(explain(error)));
  }
  if (to === "reopened") {
    const { error } = await supabase.from("interview_assignments").update({ status: "in_progress" }).eq("company_id", companyId).eq("id", assignmentId);
    if (error) back(companyId, sessionId, "e=" + encodeURIComponent(explain(error)));
  }
  revalidatePath(`/c/${companyId}/review`);
  back(companyId, sessionId, "ok=" + encodeURIComponent(to === "reviewed" ? "Marked as reviewed." : "Sent back to the person to add or change answers."));
}
