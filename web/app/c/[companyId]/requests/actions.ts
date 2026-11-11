"use server";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireMembership, explain } from "@/lib/session";

const s = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
function go(path: string, q: string): never { redirect(`${path}?${q}`); }

export async function createRequest(companyId: string, f: FormData) {
  const { supabase, membership } = await requireMembership(companyId);
  const assignee = s(f, "assignee_membership_id");
  const { data: m } = await supabase.from("memberships").select("primary_department_id").eq("company_id", companyId).eq("id", assignee).maybeSingle();
  const assigneeDept = s(f, "assignee_department_id") || m?.primary_department_id || "";
  const requestingDept = s(f, "requesting_department_id") || membership.primary_department_id || assigneeDept;
  const due = s(f, "due_on");
  // Id generated here: INSERT … RETURNING would apply the read policy, whose helper cannot see the new row yet.
  const id = randomUUID();
  const { error } = await supabase.from("clarification_tasks").insert({
    id, company_id: companyId, requester_membership_id: membership.id, requesting_department_id: requestingDept,
    assignee_department_id: assigneeDept, assignee_membership_id: assignee || null, question_text: s(f, "question"),
    context_text: s(f, "context") || null, priority: (s(f, "priority") || "normal") as "normal",
    due_at: due ? new Date(due + "T18:00:00+05:30").toISOString() : null, status: assignee ? "assigned" : "open",
    process_id: s(f, "process_id") || null, idempotency_key: s(f, "idem") || null,
  });
  if (error) go(`/c/${companyId}/requests`, "e=" + encodeURIComponent(error.code === "23505" ? "This request was already sent." : explain(error)));
  revalidatePath(`/c/${companyId}/requests`);
  go(`/c/${companyId}/requests/${id}`, "ok=" + encodeURIComponent("Request sent."));
}

export async function reply(companyId: string, taskId: string, f: FormData) {
  const { supabase, membership } = await requireMembership(companyId);
  const { error } = await supabase.from("clarification_responses").insert({
    company_id: companyId, task_id: taskId, responder_membership_id: membership.id, response_text: s(f, "text"),
  });
  const p = `/c/${companyId}/requests/${taskId}`;
  if (error) go(p, "e=" + encodeURIComponent(explain(error)));
  revalidatePath(p);
  go(p, "ok=" + encodeURIComponent("Reply sent."));
}

export async function resolve(companyId: string, taskId: string, f: FormData) {
  const { supabase } = await requireMembership(companyId);
  const p = `/c/${companyId}/requests/${taskId}`;
  const { data, error } = await supabase.from("clarification_tasks").update({ status: "resolved", outcome_text: s(f, "outcome") })
    .eq("company_id", companyId).eq("id", taskId).select("id");
  if (error) go(p, "e=" + encodeURIComponent(explain(error)));
  if (!data?.length) go(p, "e=" + encodeURIComponent("You cannot resolve this request."));
  revalidatePath(p);
  go(p, "ok=" + encodeURIComponent("Resolved."));
}

export async function askAgain(companyId: string, taskId: string) {
  const { supabase } = await requireMembership(companyId);
  const p = `/c/${companyId}/requests/${taskId}`;
  const { error } = await supabase.from("clarification_tasks").update({ status: "assigned" }).eq("company_id", companyId).eq("id", taskId);
  if (error) go(p, "e=" + encodeURIComponent(explain(error)));
  revalidatePath(p);
  go(p, "ok=" + encodeURIComponent("Sent back for a better answer."));
}

export async function cancelRequest(companyId: string, taskId: string) {
  const { supabase } = await requireMembership(companyId);
  const p = `/c/${companyId}/requests/${taskId}`;
  const { error } = await supabase.from("clarification_tasks").update({ status: "cancelled" }).eq("company_id", companyId).eq("id", taskId);
  if (error) go(p, "e=" + encodeURIComponent(explain(error)));
  revalidatePath(p);
  go(p, "ok=" + encodeURIComponent("Cancelled."));
}

export async function raiseDispute(companyId: string, taskId: string, departmentId: string, processId: string | null, f: FormData) {
  const { supabase, membership } = await requireMembership(companyId);
  const p = `/c/${companyId}/requests/${taskId}`;
  const id = randomUUID();   // see createRequest: no RETURNING under the read policy
  const { error } = await supabase.from("disputes").insert({
    id, company_id: companyId, issue_statement: s(f, "issue"), department_id: departmentId, process_id: processId,
    clarification_task_id: taskId, decision_owner_membership_id: s(f, "decision_owner"), raised_by_membership_id: membership.id,
    impact_text: s(f, "impact") || null, idempotency_key: `dispute:${taskId}`,
  });
  if (error) go(p, "e=" + encodeURIComponent(error.code === "23505" ? "A dispute already exists for this request." : explain(error)));
  await supabase.from("clarification_tasks").update({ status: "disputed" }).eq("company_id", companyId).eq("id", taskId);
  const pos = s(f, "my_position");
  if (pos) await supabase.from("dispute_positions").insert({ company_id: companyId, dispute_id: id, participant_membership_id: membership.id, position_text: pos });
  revalidatePath(p);
  go(`/c/${companyId}/disputes/${id}`, "ok=" + encodeURIComponent("Dispute raised. Each side can now record its position."));
}

export async function addPosition(companyId: string, disputeId: string, f: FormData) {
  const { supabase, membership } = await requireMembership(companyId);
  const p = `/c/${companyId}/disputes/${disputeId}`;
  const { error } = await supabase.from("dispute_positions").insert({
    company_id: companyId, dispute_id: disputeId, participant_membership_id: membership.id,
    position_text: s(f, "position"), context_text: s(f, "context") || null,
  });
  if (error) go(p, "e=" + encodeURIComponent(explain(error)));
  revalidatePath(p);
  go(p, "ok=" + encodeURIComponent("Your position is recorded."));
}

export async function decide(companyId: string, disputeId: string, f: FormData) {
  const { supabase, membership } = await requireMembership(companyId);
  const p = `/c/${companyId}/disputes/${disputeId}`;
  const { error } = await supabase.from("dispute_decisions").insert({
    company_id: companyId, dispute_id: disputeId, decided_by_membership_id: membership.id,
    decision_text: s(f, "decision"), rationale: s(f, "rationale"), resulting_actions: s(f, "actions") || null,
  });
  if (error) go(p, "e=" + encodeURIComponent(explain(error)));
  revalidatePath(p);
  go(p, "ok=" + encodeURIComponent("Decision recorded. The dispute is closed."));
}

export async function markRead(companyId: string) {
  const { supabase, membership } = await requireMembership(companyId);
  await supabase.from("notifications").update({ read_at: new Date().toISOString() })
    .eq("company_id", companyId).eq("recipient_membership_id", membership.id).is("read_at", null);
  revalidatePath(`/c/${companyId}`);
  redirect(`/c/${companyId}`);
}
