import { nowMs } from "@/lib/time";
import Link from "next/link";
import { requireMembership } from "@/lib/session";
import { fmtDate, memberNames } from "@/lib/names";
import { KIND, OPEN, PRIORITY, STATUS, priorityBadge, statusBadge } from "@/lib/tickets";
import { createTicket } from "./actions";

type T = { id: string; code: string; kind: string; title: string; priority: string; status: string; due_at: string | null; created_at: string;
  requester_membership_id: string | null; assignee_membership_id: string | null; assignee_department_id: string | null; escalated_to_membership_id: string | null; reminder_count: number };

const TABS = [["me", "For me"], ["raised", "Raised by me"], ["team", "My team"], ["support", "Help & support"], ["done", "Done"]] as const;

/** "My work" (D-093): one place for everything someone has to do — tickets, requests from colleagues, approvals, saved questions. */
export default async function MyWork({ params, searchParams }: { params: Promise<{ companyId: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { companyId } = await params;
  const sp = await searchParams;
  const { supabase, membership, permissions } = await requireMembership(companyId);
  const me = membership.id;
  const manager = permissions.has("ticket.manage");
  const tab = (TABS.find(([k]) => k === sp.tab)?.[0] ?? "me") as (typeof TABS)[number][0];

  const [{ data: all }, { data: depts }, { members }, { data: reqs }, { data: ctqs }, { data: cls }, { data: bpq }, { data: cases }] = await Promise.all([
    supabase.from("tickets").select("id, code, kind, title, priority, status, due_at, created_at, requester_membership_id, assignee_membership_id, assignee_department_id, escalated_to_membership_id, reminder_count")
      .eq("company_id", companyId).order("created_at", { ascending: false }).limit(500),
    supabase.from("departments").select("id, name").eq("company_id", companyId).order("name"),
    memberNames(supabase, companyId),
    supabase.from("clarification_tasks").select("id, code, question_text, due_at").eq("company_id", companyId).eq("assignee_membership_id", me).in("status", ["open", "assigned", "escalated"]),
    permissions.has("blueprint.approve") ? supabase.from("ctq_items").select("id, name, target_requested_by").eq("company_id", companyId).eq("status", "pending_approval") : Promise.resolve({ data: [] as { id: string; name: string; target_requested_by: string | null }[] }),
    permissions.has("catalogue.approve") ? supabase.from("catalogue_classification_requests").select("id, item_id, requested_by").eq("company_id", companyId).eq("status", "pending") : Promise.resolve({ data: [] as { id: string; item_id: string; requested_by: string }[] }),
    supabase.from("blueprint_open_questions").select("id, question").eq("company_id", companyId).eq("assigned_to", me).eq("status", "open"),
    permissions.has("document.approve") ? supabase.from("board_cases").select("id, title").eq("company_id", companyId).eq("status", "awaiting_approval") : Promise.resolve({ data: [] as { id: string; title: string }[] }),
  ]);
  const rows = (all ?? []) as T[];
  const names = new Map(members.map((m) => [m.id, m.name]));
  const dname = new Map((depts ?? []).map((d) => [d.id, d.name]));
  const now = nowMs();
  const overdue = (t: T) => OPEN.includes(t.status) && !!t.due_at && Date.parse(t.due_at) < now;
  const open = (t: T) => OPEN.includes(t.status);
  const lists: Record<string, T[]> = {
    me: rows.filter((t) => open(t) && (t.assignee_membership_id === me || t.escalated_to_membership_id === me)),
    raised: rows.filter((t) => open(t) && t.requester_membership_id === me && t.kind !== "support"),
    team: rows.filter((t) => open(t) && t.kind !== "support" && t.kind !== "billing_dispute"),
    support: rows.filter((t) => t.kind === "support" || t.kind === "billing_dispute"),
    done: rows.filter((t) => !open(t) && (t.assignee_membership_id === me || t.requester_membership_id === me)),
  };
  const list = lists[tab] ?? [];
  const waiting = [
    ...(reqs ?? []).map((r) => ({ href: `/c/${companyId}/requests/${r.id}`, text: `Colleague's question ${r.code}: ${r.question_text.slice(0, 90)}`, due: r.due_at })),
    ...(bpq ?? []).map((q) => ({ href: `/c/${companyId}/blueprint?tab=questions`, text: `Leadership question: ${q.question.slice(0, 90)}`, due: null })),
    ...(ctqs ?? []).filter((c) => c.target_requested_by !== me).map((c) => ({ href: `/c/${companyId}/blueprint?tab=ctq`, text: `Approve the target for “${c.name}”`, due: null })),
    ...(cls ?? []).filter((c) => c.requested_by !== me).map((c) => ({ href: `/c/${companyId}/catalogue/${c.item_id}`, text: "Approve a classification change", due: null })),
    ...(cases ?? []).map((c) => ({ href: `/c/${companyId}/board/${c.id}`, text: `Approve the expert board's result: ${c.title}`, due: null })),
  ];
  const mine = lists.me!;
  const newKind = sp.new;

  return (
    <>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <div><h1>My work</h1><p className="muted" style={{ margin: 0 }}>Everything waiting for you in one place. You get one summary a day, never a flood.</p></div>
        <div className="row">
          <Link className="button" href="?new=action#new">New task</Link>
          <Link className="button secondary" href="?tab=support&new=support#new">Get help</Link>
        </div>
      </div>
      {sp.e && <div className="notice error">{sp.e}</div>}
      {sp.ok && <div className="notice ok">{sp.ok}</div>}

      <div className="kpis" data-testid="work-kpis">
        <div className={`kpi ${mine.length ? "" : "good"}`}><div className="kpi-label">Assigned to you</div><div className="kpi-value">{mine.length}</div></div>
        <div className={`kpi ${mine.some(overdue) ? "attn" : ""}`}><div className="kpi-label">Overdue</div><div className="kpi-value">{mine.filter(overdue).length}</div></div>
        <div className="kpi"><div className="kpi-label">Waiting for your reply or approval</div><div className="kpi-value">{waiting.length}</div></div>
        <div className="kpi"><div className="kpi-label">You raised, still open</div><div className="kpi-value">{lists.raised!.length}</div></div>
      </div>

      {waiting.length > 0 && (
        <section className="card" data-testid="waiting">
          <strong>Also waiting for you</strong>
          <ul style={{ margin: "8px 0 0" }}>{waiting.map((w, k) => <li key={k}><Link href={w.href}>{w.text}</Link>{w.due && <span className="muted small"> · due {fmtDate(w.due)}</span>}</li>)}</ul>
        </section>
      )}

      <div className="tabs" role="tablist" style={{ marginTop: 16 }}>
        {TABS.filter(([k]) => k !== "team" || manager).map(([k, l]) => (
          <Link key={k} href={`?tab=${k}`} role="tab" aria-selected={tab === k} className={`tab${tab === k ? " on" : ""}`} style={{ textDecoration: "none" }}>
            {l}{k !== "done" && lists[k]!.filter(open).length ? ` (${lists[k]!.filter(open).length})` : ""}
          </Link>
        ))}
      </div>
      {list.length === 0 ? (
        <p className="muted" data-testid="empty">{tab === "me" ? "Nothing assigned to you right now. Nice work." : tab === "support" ? "No help requests yet — if something doesn't work or is unclear, ask us." : "Nothing here."}</p>
      ) : (
        <div className="table-wrap card" style={{ padding: 0 }}>
          <table data-testid="tickets-table">
            <thead><tr><th>Ticket</th><th>What</th><th>Kind</th><th>Priority</th><th>{tab === "raised" ? "With" : "From"}</th><th>Status</th><th>Due</th></tr></thead>
            <tbody>{list.map((t) => (
              <tr key={t.id}>
                <td><Link href={`/c/${companyId}/tasks/${t.id}`} className="mono">{t.code}</Link></td>
                <td style={{ whiteSpace: "normal", minWidth: 220 }}>{t.title}{t.escalated_to_membership_id === me && <> <span className="badge danger">escalated to you</span></>}</td>
                <td className="small">{KIND[t.kind] ?? t.kind}</td>
                <td><span className={`badge ${priorityBadge(t.priority)}`}>{PRIORITY[t.priority]}</span></td>
                <td className="small">{tab === "raised" ? (t.assignee_membership_id ? names.get(t.assignee_membership_id) : dname.get(t.assignee_department_id ?? "")) ?? (t.kind === "support" ? "Platform team" : "—")
                  : t.requester_membership_id ? names.get(t.requester_membership_id) ?? "—" : "System"}</td>
                <td><span className={`badge ${statusBadge(t.status, overdue(t))}`}>{overdue(t) ? "Overdue" : STATUS[t.status]}</span>{t.reminder_count > 0 && OPEN.includes(t.status) && <span className="muted small"> · reminder {t.reminder_count}</span>}</td>
                <td className="small">{fmtDate(t.due_at)}</td>
              </tr>))}
            </tbody>
          </table>
        </div>
      )}

      {newKind && (
        <section id="new" className="card" data-testid="new-ticket">
          <h2 style={{ marginTop: 0 }}>{newKind === "support" ? "Ask the platform team for help" : "New task"}</h2>
          <form action={createTicket.bind(null, companyId)}>
            {newKind === "support" ? <input type="hidden" name="kind" value="support" /> : (
              <div className="grid2">
                <div><label htmlFor="t-kind">Kind</label>
                  <select id="t-kind" name="kind" defaultValue={newKind}>
                    {["action", "question", "review", "approval", "improvement", "risk_action"].map((k) => <option key={k} value={k}>{KIND[k]}</option>)}
                  </select></div>
                <div><label htmlFor="t-target">Who should do it</label>
                  <select id="t-target" name="target" required defaultValue="">
                    <option value="" disabled>Choose a person or a department…</option>
                    <optgroup label="Me">{<option value={`m:${me}`}>Myself</option>}</optgroup>
                    <optgroup label="A colleague">{members.filter((m) => m.status === "active" && m.id !== me).map((m) => <option key={m.id} value={`m:${m.id}`}>{m.name}</option>)}</optgroup>
                    <optgroup label="A department">{(depts ?? []).map((d) => <option key={d.id} value={`d:${d.id}`}>{d.name}</option>)}</optgroup>
                  </select></div>
              </div>)}
            <label htmlFor="t-title">{newKind === "support" ? "What do you need help with?" : "Title"}</label>
            <input id="t-title" name="title" required minLength={3} maxLength={200} placeholder={newKind === "support" ? "e.g. I can't see my interview" : "e.g. Update the pincode allocation sheet"} />
            <label htmlFor="t-desc">Details (optional)</label>
            <textarea id="t-desc" name="description" rows={3} />
            <div className="grid2">
              <div><label htmlFor="t-pri">Priority</label>
                <select id="t-pri" name="priority" defaultValue="normal">{Object.entries(PRIORITY).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
              {newKind !== "support" && <div><label htmlFor="t-due">Due date (optional — set from the priority otherwise)</label><input id="t-due" name="due" type="date" /></div>}
            </div>
            <button type="submit" style={{ marginTop: 12 }}>{newKind === "support" ? "Send to the platform team" : "Create task"}</button>
          </form>
        </section>
      )}
    </>
  );
}
