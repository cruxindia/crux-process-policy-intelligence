"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { explain, requireMembership } from "@/lib/session";

const s = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const uuidOrNull = (v: string) => (/^[0-9a-f-]{36}$/i.test(v) ? v : null);

export async function requestClassification(companyId: string, itemId: string, form: FormData) {
  const { supabase } = await requireMembership(companyId);
  const { data, error } = await supabase.rpc("catalogue_request_classification", { p_company: companyId, p_item: itemId, p_to: s(form, "to"),
    p_basis: s(form, "basis") || null, p_reference: s(form, "reference") || null, p_reason: s(form, "reason") });
  revalidatePath(`/c/${companyId}/catalogue`);
  redirect(`/c/${companyId}/catalogue/${itemId}?${error ? "e=" + encodeURIComponent(explain(error))
    : "ok=" + encodeURIComponent(data === "pending" ? "Sent for approval — a second person must approve this change." : "Classification saved.")}`);
}

export async function decideClassification(companyId: string, requestId: string, back: string, form: FormData) {
  const { supabase } = await requireMembership(companyId);
  const { error } = await supabase.rpc("catalogue_decide_classification", { p_company: companyId, p_request: requestId,
    p_decision: s(form, "decision"), p_note: s(form, "note") });
  const to = back === "item" ? `/c/${companyId}/catalogue/${s(form, "item")}` : `/c/${companyId}/catalogue`;
  revalidatePath(`/c/${companyId}/catalogue`);
  redirect(`${to}?${error ? "e=" + encodeURIComponent(explain(error)) : "ok=" + encodeURIComponent(s(form, "decision") === "approved" ? "Approved." : "Rejected — the reason is recorded.")}`);
}

export async function setStatus(companyId: string, itemId: string, form: FormData) {
  const { supabase } = await requireMembership(companyId);
  const { error } = await supabase.rpc("catalogue_set_status", { p_company: companyId, p_item: itemId,
    p_process_status: s(form, "process_status"), p_process_note: s(form, "process_note") || null,
    p_document_status: s(form, "document_status"), p_document_note: s(form, "document_note") || null,
    p_discovered_process: uuidOrNull(s(form, "discovered_process")), p_process: uuidOrNull(s(form, "process")) });
  revalidatePath(`/c/${companyId}/catalogue`);
  redirect(`/c/${companyId}/catalogue/${itemId}?${error ? "e=" + encodeURIComponent(explain(error)) : "ok=Status saved."}`);
}

/** Opens an expert-board drafting case for this item and links it back (document becomes "being drafted"). */
export async function draftWithBoard(companyId: string, itemId: string) {
  const { supabase } = await requireMembership(companyId);
  const { data: it } = await supabase.from("catalogue_gaps").select("kind, title, code, function_name, ownership_note, classification, basis, basis_reference, process_note, discovered_process_id")
    .eq("company_id", companyId).eq("id", itemId).single();
  if (!it) redirect(`/c/${companyId}/catalogue`);
  const brief = [`Catalogue item ${it.code}: ${it.title} (${it.function_name}).`, it.ownership_note && `Expected ownership: ${it.ownership_note}.`,
    it.classification !== "unassessed" && `Classified ${it.classification}${it.basis ? ` (basis: ${it.basis}${it.basis_reference ? ` — ${it.basis_reference}` : ""})` : ""}.`,
    it.process_note && `How it is done today: ${it.process_note}`,
    "Draft it for Crux Risk Management; mark every fact that is not given here as a placeholder."].filter(Boolean).join(" ");
  const { data: caseId, error } = await supabase.rpc("open_board_case", { p_company: companyId, p_kind: "document_draft",
    p_doc_type: it.kind === "policy" ? "policy" : "sop", p_title: it.title, p_brief: brief,
    p_process_ids: it.discovered_process_id ? [it.discovered_process_id] : [], p_classification: "internal" });
  if (error || !caseId) redirect(`/c/${companyId}/catalogue/${itemId}?e=${encodeURIComponent(explain(error) || "Could not open the case.")}`);
  await supabase.rpc("catalogue_link_case", { p_company: companyId, p_item: itemId, p_case: caseId });
  redirect(`/c/${companyId}/board/${caseId}`);
}

export async function mapFunction(companyId: string, form: FormData) {
  const { supabase } = await requireMembership(companyId);
  const id = uuidOrNull(s(form, "id"));
  const { data: f } = await supabase.from("catalogue_functions").select("code, name, description").eq("company_id", companyId).eq("id", id ?? "").single();
  if (!f) redirect(`/c/${companyId}/catalogue?e=Function+not+found`);
  const { error } = await supabase.rpc("catalogue_save_function", { p_company: companyId, p_id: id, p_code: f.code, p_name: f.name,
    p_description: f.description, p_department: uuidOrNull(s(form, "department")) });
  revalidatePath(`/c/${companyId}/catalogue`);
  redirect(`/c/${companyId}/catalogue?tab=functions&${error ? "e=" + encodeURIComponent(explain(error)) : "ok=Owning+department+saved."}`);
}

export async function addItem(companyId: string, form: FormData) {
  const { supabase } = await requireMembership(companyId);
  const { data, error } = await supabase.rpc("catalogue_save_item", { p_company: companyId, p_id: null, p_kind: s(form, "kind"), p_code: s(form, "code"),
    p_title: s(form, "title"), p_description: s(form, "description") || null, p_function: s(form, "function"), p_ownership_note: s(form, "owner") || null });
  revalidatePath(`/c/${companyId}/catalogue`);
  if (error || !data) redirect(`/c/${companyId}/catalogue?e=${encodeURIComponent(explain(error) || "Could not add.")}`);
  redirect(`/c/${companyId}/catalogue/${data}?ok=Added.`);
}
