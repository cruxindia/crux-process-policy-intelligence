"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { explain, requireMembership } from "@/lib/session";

const s = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const uuid = (v: string) => (/^[0-9a-f-]{36}$/i.test(v) ? v : null);
function done(companyId: string, tab: string, error: { message: string; code?: string } | null, ok: string): never {
  revalidatePath(`/c/${companyId}/blueprint`);
  redirect(`/c/${companyId}/blueprint?tab=${tab}&${error ? "e=" + encodeURIComponent(explain(error)) : "ok=" + encodeURIComponent(ok)}#${tab}`);
}

export async function startLeadership(companyId: string, form: FormData) {
  const { supabase } = await requireMembership(companyId);
  const members = form.getAll("members").map(String).filter((m) => uuid(m));
  const { data, error } = await supabase.rpc("blueprint_start_leadership", { p_company: companyId, p_members: members });
  done(companyId, "leadership", error, data ? `${data} leader${data === 1 ? "" : "s"} invited — they will see the interview on their home page.` : "Everyone chosen already has the interview.");
}

export async function addEntry(companyId: string, form: FormData) {
  const { supabase } = await requireMembership(companyId);
  const { error } = await supabase.rpc("blueprint_add_entry", { p_company: companyId, p_section: s(form, "section"), p_statement: s(form, "statement") });
  done(companyId, "review", error, "Statement added to the blueprint.");
}

export async function decideEntry(companyId: string, entryId: string, form: FormData) {
  const { supabase } = await requireMembership(companyId);
  const decision = s(form, "decision");
  const { error } = await supabase.rpc("blueprint_decide_entry", { p_company: companyId, p_entry: entryId, p_decision: decision,
    p_statement: s(form, "statement") || null, p_note: s(form, "note") || null });
  done(companyId, "review", error, decision === "confirmed" ? "Confirmed." : "Rejected — the reason is recorded.");
}

export async function assignQuestion(companyId: string, questionId: string, form: FormData) {
  const { supabase } = await requireMembership(companyId);
  const dismiss = s(form, "dismiss") === "1";
  const { error } = await supabase.rpc("blueprint_assign_question", { p_company: companyId, p_question: questionId, p_member: uuid(s(form, "member")), p_dismiss: dismiss });
  done(companyId, "questions", error, dismiss ? "Question dismissed." : "Question sent.");
}

export async function answerQuestion(companyId: string, questionId: string, form: FormData) {
  const { supabase } = await requireMembership(companyId);
  const { error } = await supabase.rpc("blueprint_answer_question", { p_company: companyId, p_question: questionId, p_answer: s(form, "answer") });
  done(companyId, "questions", error, "Thank you — your answer goes to the blueprint review.");
}

export async function saveCtq(companyId: string, form: FormData) {
  const { supabase } = await requireMembership(companyId);
  const { error } = await supabase.rpc("ctq_save", { p_company: companyId, p_id: uuid(s(form, "id")), p_name: s(form, "name"), p_voice: s(form, "voice"),
    p_measure: s(form, "measure"), p_unit: s(form, "unit") || null, p_direction: s(form, "direction") || "higher_better", p_baseline: s(form, "baseline") || null,
    p_expectation: s(form, "expectation") || null });
  done(companyId, "ctq", error, "CTQ saved.");
}

export async function requestTarget(companyId: string, ctqId: string, form: FormData) {
  const { supabase } = await requireMembership(companyId);
  const raw = s(form, "target_value");
  const value = raw === "" ? null : Number(raw);
  if (value !== null && !Number.isFinite(value)) done(companyId, "ctq", { message: "The target must be a number (or use the text field)." }, "");
  const { error } = await supabase.rpc("ctq_request_target", { p_company: companyId, p_ctq: ctqId, p_target_value: value, p_target_text: s(form, "target_text") || null,
    p_reason: s(form, "reason") });
  done(companyId, "ctq", error, "Target sent for approval — a second person must approve it.");
}

export async function decideTarget(companyId: string, ctqId: string, form: FormData) {
  const { supabase } = await requireMembership(companyId);
  const decision = s(form, "decision");
  const { error } = await supabase.rpc("ctq_decide_target", { p_company: companyId, p_ctq: ctqId, p_decision: decision, p_note: s(form, "note") || null });
  done(companyId, "ctq", error, decision === "approved" ? "Target approved." : "Target rejected — the CTQ waits for a new proposal.");
}

export async function retireCtq(companyId: string, ctqId: string, form: FormData) {
  const { supabase } = await requireMembership(companyId);
  const { error } = await supabase.rpc("ctq_retire", { p_company: companyId, p_ctq: ctqId, p_note: s(form, "note") });
  done(companyId, "ctq", error, "CTQ removed from use.");
}

export async function publish(companyId: string, form: FormData) {
  const { supabase } = await requireMembership(companyId);
  const { data, error } = await supabase.rpc("blueprint_publish", { p_company: companyId, p_note: s(form, "note") || null });
  done(companyId, "overview", error, `Version ${data} published — department documents now build on it.`);
}
