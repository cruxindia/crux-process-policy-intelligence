"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { explain, requireMembership } from "@/lib/session";

const DOC_TYPES = ["policy", "sop", "agreement", "board_resolution", "compliance_checklist", "charter", "other"];
const CLASSES = ["internal", "confidential"];

/** Opens a drafting case; the case page starts the board as soon as it loads. */
export async function openDocumentCase(companyId: string, form: FormData) {
  const { supabase } = await requireMembership(companyId);
  const docType = String(form.get("doc_type") ?? "");
  const cls = String(form.get("classification") ?? "internal");
  const title = String(form.get("title") ?? "").trim();
  const brief = String(form.get("brief") ?? "").trim();
  const procs = form.getAll("process_ids").map(String).filter((x) => /^[0-9a-f-]{36}$/i.test(x)).slice(0, 10);
  if (!DOC_TYPES.includes(docType) || !CLASSES.includes(cls)) redirect(`/c/${companyId}/board?e=${encodeURIComponent("Choose a document type and classification.")}`);
  const { data, error } = await supabase.rpc("open_board_case", { p_company: companyId, p_kind: "document_draft", p_doc_type: docType,
    p_title: title, p_brief: brief, p_process_ids: procs, p_classification: cls });
  if (error || !data) redirect(`/c/${companyId}/board?e=${encodeURIComponent(explain(error) || "Could not open the case.")}`);
  redirect(`/c/${companyId}/board/${data}`);
}

/** From the Review Centre: ask the expert teams to improve one discovered process. */
export async function openImprovementCase(companyId: string, sessionId: string, processId: string, processName: string) {
  const { supabase } = await requireMembership(companyId);
  const back = /^[0-9a-f-]{36}$/i.test(sessionId) ? `/c/${companyId}/work/${sessionId}` : `/c/${companyId}/board`;
  const { data, error } = await supabase.rpc("open_board_case", { p_company: companyId, p_kind: "improvement_review", p_doc_type: null,
    p_title: `Improve: ${processName}`.slice(0, 200), p_brief: "Diagnose this process as described in the interview and recommend improvements, quick wins first.",
    p_process_ids: [processId], p_classification: "internal" });
  if (error || !data) redirect(`${back}?e=${encodeURIComponent(explain(error) || "Could not open the case.")}`);
  redirect(`/c/${companyId}/board/${data}`);
}

export async function decideCase(companyId: string, caseId: string, form: FormData) {
  const { supabase } = await requireMembership(companyId);
  const decision = String(form.get("decision") ?? "");
  const note = String(form.get("note") ?? "").trim();
  const { error } = await supabase.rpc("decide_board_case", { p_company: companyId, p_case: caseId, p_decision: decision, p_note: note });
  revalidatePath(`/c/${companyId}/board/${caseId}`);
  redirect(`/c/${companyId}/board/${caseId}?${error ? "e=" + encodeURIComponent(explain(error)) : "ok=" + encodeURIComponent(decision === "approved" ? "Approved." : "Rejected — the reason is recorded.")}`);
}
