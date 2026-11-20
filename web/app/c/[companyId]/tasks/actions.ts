"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { explain, requireMembership } from "@/lib/session";

const s = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

export async function createTicket(companyId: string, form: FormData) {
  const { supabase } = await requireMembership(companyId);
  const target = s(form, "target");                        // "m:<membership>" | "d:<department>" | "" (support)
  const kind = s(form, "kind");
  const due = s(form, "due");
  const { data, error } = await supabase.rpc("ticket_create", {
    p_company: companyId, p_kind: kind, p_title: s(form, "title"), p_description: s(form, "description") || null, p_priority: s(form, "priority") || "normal",
    p_assignee: target.startsWith("m:") ? target.slice(2) : null, p_department: target.startsWith("d:") ? target.slice(2) : null,
    p_due: due ? new Date(`${due}T18:00:00+05:30`).toISOString() : null,
    p_related_type: s(form, "related_type") || null, p_related_id: s(form, "related_id") || null, p_related_label: s(form, "related_label") || null });
  if (error) redirect(`/c/${companyId}/tasks?new=${encodeURIComponent(kind || "action")}&e=${encodeURIComponent(explain(error))}`);
  revalidatePath(`/c/${companyId}/tasks`);
  redirect(`/c/${companyId}/tasks/${data}?ok=${encodeURIComponent(kind === "support" ? "Sent to the platform team — you'll see their reply here." : "Created — the person has been notified.")}`);
}

export async function commentTicket(companyId: string, ticketId: string, form: FormData) {
  const { supabase } = await requireMembership(companyId);
  const { error } = await supabase.rpc("ticket_comment", { p_company: companyId, p_ticket: ticketId, p_body: s(form, "body") });
  revalidatePath(`/c/${companyId}/tasks/${ticketId}`);
  redirect(`/c/${companyId}/tasks/${ticketId}?${error ? "e=" + encodeURIComponent(explain(error)) : ""}#thread`);
}

export async function setTicketStatus(companyId: string, ticketId: string, form: FormData) {
  const { supabase } = await requireMembership(companyId);
  const { error } = await supabase.rpc("ticket_set_status", { p_company: companyId, p_ticket: ticketId, p_status: s(form, "status"), p_resolution: s(form, "resolution") || null });
  revalidatePath(`/c/${companyId}/tasks`);
  redirect(`/c/${companyId}/tasks/${ticketId}?${error ? "e=" + encodeURIComponent(explain(error)) : "ok=Updated"}`);
}

export async function assignTicket(companyId: string, ticketId: string, form: FormData) {
  const { supabase } = await requireMembership(companyId);
  const due = s(form, "due");
  const { error } = await supabase.rpc("ticket_assign", { p_company: companyId, p_ticket: ticketId, p_assignee: s(form, "assignee"),
    p_due: due ? new Date(`${due}T18:00:00+05:30`).toISOString() : null, p_priority: s(form, "priority") || null });
  revalidatePath(`/c/${companyId}/tasks`);
  redirect(`/c/${companyId}/tasks/${ticketId}?${error ? "e=" + encodeURIComponent(explain(error)) : "ok=Re-assigned+and+notified"}`);
}
