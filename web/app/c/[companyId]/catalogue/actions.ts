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

/** Every interview description linked to this item that the caller may read (the board gets all of them → one company document). */
async function sourceIds(supabase: Awaited<ReturnType<typeof requireMembership>>["supabase"], companyId: string, itemId: string) {
  const { data } = await supabase.from("catalogue_item_sources").select("discovered_process_id").eq("company_id", companyId).eq("item_id", itemId).limit(25);
  return (data ?? []).map((r) => r.discovered_process_id as string);
}

function itemBrief(it: { code: string; title: string; function_name: string; ownership_note: string | null; classification: string; basis: string | null;
  basis_reference: string | null; process_note: string | null }, n: number) {
  return [`Catalogue item ${it.code}: ${it.title} (${it.function_name}).`, it.ownership_note && `Expected ownership: ${it.ownership_note}.`,
    it.classification !== "unassessed" && `Classified ${it.classification}${it.basis ? ` (basis: ${it.basis}${it.basis_reference ? ` — ${it.basis_reference}` : ""})` : ""}.`,
    it.process_note && `How it is done today: ${it.process_note}`,
    n > 1 && `The ${n} interview sources describe the SAME company work as told by different people: produce ONE company document that reconciles them; list genuine differences under "Variations and open points".`,
    "Draft it for Crux Risk Management; mark every fact that is not given here as a placeholder."].filter(Boolean).join(" ");
}

const ITEM_COLS = "kind, title, code, function_name, ownership_note, classification, basis, basis_reference, process_note";

/** Opens an expert-board drafting case for this item from ALL linked descriptions and links it back (document becomes "being drafted"). */
export async function draftWithBoard(companyId: string, itemId: string) {
  const { supabase } = await requireMembership(companyId);
  const { data: it } = await supabase.from("catalogue_gaps").select(ITEM_COLS).eq("company_id", companyId).eq("id", itemId).single();
  if (!it) redirect(`/c/${companyId}/catalogue`);
  const ids = await sourceIds(supabase, companyId, itemId);
  const { data: caseId, error } = await supabase.rpc("open_board_case", { p_company: companyId, p_kind: "document_draft",
    p_doc_type: it.kind === "policy" ? "policy" : "sop", p_title: it.title, p_brief: itemBrief(it, ids.length),
    p_process_ids: ids, p_classification: "internal" });
  if (error || !caseId) redirect(`/c/${companyId}/catalogue/${itemId}?e=${encodeURIComponent(explain(error) || "Could not open the case.")}`);
  await supabase.rpc("catalogue_link_case", { p_company: companyId, p_item: itemId, p_case: caseId });
  redirect(`/c/${companyId}/board/${caseId}`);
}

/** Expert improvement review of how the company does this work, from every linked description (not one person's). */
export async function improveWithBoard(companyId: string, itemId: string) {
  const { supabase } = await requireMembership(companyId);
  const { data: it } = await supabase.from("catalogue_gaps").select(ITEM_COLS).eq("company_id", companyId).eq("id", itemId).single();
  if (!it) redirect(`/c/${companyId}/catalogue`);
  const ids = await sourceIds(supabase, companyId, itemId);
  const { data: caseId, error } = await supabase.rpc("open_board_case", { p_company: companyId, p_kind: "improvement_review", p_doc_type: null,
    p_title: `Improve: ${it.title}`, p_brief: itemBrief(it, ids.length).replace("Draft it for", "Recommend improvements for"), p_process_ids: ids, p_classification: "internal" });
  if (error || !caseId) redirect(`/c/${companyId}/catalogue/${itemId}?e=${encodeURIComponent(explain(error) || "Could not open the case.")}`);
  redirect(`/c/${companyId}/board/${caseId}`);
}

/** Link an interview description to a company item (form: item, discovered, method, back = "item" | "inbox"). */
export async function linkSource(companyId: string, form: FormData) {
  const { supabase } = await requireMembership(companyId);
  const item = uuidOrNull(s(form, "item")); const dp = uuidOrNull(s(form, "discovered"));
  if (!item || !dp) redirect(`/c/${companyId}/catalogue?tab=inbox&e=${encodeURIComponent("Choose the company item.")}`);
  const { error } = await supabase.rpc("catalogue_link_source", { p_company: companyId, p_item: item, p_discovered: dp,
    p_method: s(form, "method") === "suggested" ? "suggested" : "manual" });
  revalidatePath(`/c/${companyId}/catalogue`);
  const to = s(form, "back") === "item" && item ? `/c/${companyId}/catalogue/${item}` : `/c/${companyId}/catalogue?tab=inbox`;
  redirect(`${to}${to.includes("?") ? "&" : "?"}${error ? "e=" + encodeURIComponent(explain(error)) : "ok=" + encodeURIComponent("Linked — it now counts towards the company item.")}`);
}

export async function unlinkSource(companyId: string, itemId: string, form: FormData) {
  const { supabase } = await requireMembership(companyId);
  const { error } = await supabase.rpc("catalogue_unlink_source", { p_company: companyId, p_discovered: uuidOrNull(s(form, "discovered")) ?? "" });
  revalidatePath(`/c/${companyId}/catalogue`);
  redirect(`/c/${companyId}/catalogue/${itemId}?${error ? "e=" + encodeURIComponent(explain(error)) : "ok=Removed from this item."}`);
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

/** Department-head validation of the company version of this process (D-088). */
export async function validateProcess(companyId: string, itemId: string, form: FormData) {
  const { supabase } = await requireMembership(companyId);
  const decision = s(form, "decision");
  const { error } = await supabase.rpc("process_validate", { p_company: companyId, p_item: itemId, p_decision: decision, p_note: s(form, "note") || null });
  revalidatePath(`/c/${companyId}/catalogue`);
  redirect(`/c/${companyId}/catalogue/${itemId}?${error ? "e=" + encodeURIComponent(explain(error))
    : "ok=" + encodeURIComponent(decision === "validated" ? "Validated — the process is recorded as confirmed by the department." : "Sent back — the reason is recorded.")}#validation`);
}
