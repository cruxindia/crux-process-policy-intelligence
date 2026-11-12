"use server";
// AI connections (Master Corrective Prompt v2.0, Part 6). Browsers may only write descriptive columns (column-limited grants +
// RLS: org.manage). Keys never pass through here — they go straight to the discovery-ai function, which stores them in Vault.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireMembership, explain } from "@/lib/session";

const s = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const back = (c: string, q: string): never => redirect(`/c/${c}/admin/ai?${q}`);
const ok = (c: string, m: string) => { revalidatePath(`/c/${c}/admin/ai`); back(c, `ok=${encodeURIComponent(m)}`); };
const fail = (c: string, m: string) => back(c, `e=${encodeURIComponent(m)}`);
const CATS = ["", "discovery", "adaptive", "review", "documents"];

function fields(f: FormData) {
  const provider = s(f, "provider") === "ollama" ? "ollama" : "gemini";
  const priority = Number(s(f, "priority") || "100");
  return {
    name: s(f, "name"), provider, policy_provider: s(f, "policy_provider") || (provider === "ollama" ? "local_ollama" : "gemini_free"),
    gcp_project_id: s(f, "gcp_project_id") || null, model: s(f, "model") || (provider === "ollama" ? "llama3.1" : "gemini-flash-lite-latest"),
    base_url: provider === "ollama" ? s(f, "base_url") || null : null, priority: Number.isFinite(priority) ? Math.min(1000, Math.max(1, Math.round(priority))) : 100,
  } as const;
}

export async function addConnection(companyId: string, f: FormData) {
  const { supabase } = await requireMembership(companyId);
  const { error } = await supabase.from("ai_provider_connections").insert({ company_id: companyId, ...fields(f), status: "active" });
  if (error) fail(companyId, /PPI_LIMIT/.test(error.message) ? "The connection limit for this company has been reached." : explain(error));
  ok(companyId, "Connection added. Store its key, then press Test.");
}

export async function updateConnection(companyId: string, id: string, f: FormData) {
  const { supabase } = await requireMembership(companyId);
  const status = s(f, "status") === "disabled" ? "disabled" : "active";
  const { data, error } = await supabase.from("ai_provider_connections").update({ ...fields(f), status }).eq("company_id", companyId).eq("id", id).select("id");
  if (error) fail(companyId, explain(error));
  if (!data?.length) fail(companyId, "You are not allowed to change AI connections.");
  ok(companyId, "Connection saved.");
}

export async function addAssignment(companyId: string, connectionId: string, f: FormData) {
  const { supabase } = await requireMembership(companyId);
  const cat = s(f, "interview_category");
  if (!CATS.includes(cat)) fail(companyId, "Choose a valid interview type.");
  const dept = s(f, "department_id") || null, proc = s(f, "process_id") || null;
  if (!dept && !proc && !cat) fail(companyId, "Choose a department, a process or an interview type (leave all empty to keep the connection shared).");
  const { error } = await supabase.from("ai_connection_assignments").insert({ company_id: companyId, connection_id: connectionId,
    department_id: dept, process_id: proc, interview_category: cat || null, active: true });
  if (error) fail(companyId, explain(error));
  ok(companyId, "Assignment added.");
}

export async function setAssignmentActive(companyId: string, id: string, active: boolean) {
  const { supabase } = await requireMembership(companyId);
  const { data, error } = await supabase.from("ai_connection_assignments").update({ active }).eq("company_id", companyId).eq("id", id).select("id");
  if (error) fail(companyId, explain(error));
  if (!data?.length) fail(companyId, "You are not allowed to change assignments.");
  ok(companyId, active ? "Assignment switched on." : "Assignment switched off.");
}
