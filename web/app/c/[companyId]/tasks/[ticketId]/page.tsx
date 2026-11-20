import { nowMs } from "@/lib/time";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireMembership } from "@/lib/session";
import { fmtDate, memberNames } from "@/lib/names";
import { KIND, OPEN, PRIORITY, STATUS, priorityBadge, statusBadge } from "@/lib/tickets";
import { assignTicket, commentTicket, setTicketStatus } from "../actions";

const RELATED: Record<string, (co: string, id: string) => string> = {
  catalogue_item: (co, id) => `/c/${co}/catalogue/${id}`, board_case: (co, id) => `/c/${co}/board/${id}`,
  invoice: (co, id) => `/c/${co}/billing/${id}`, interview_session: (co, id) => `/c/${co}/work/${id}`,
};

export default async function TicketPage({ params, searchParams }: { params: Promise<{ companyId: string; ticketId: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { companyId, ticketId } = await params;
  const sp = await searchParams;
  const { supabase, membership, permissions } = await requireMembership(companyId);
  const [{ data: t }, { data: thread }, { members }, { data: depts }] = await Promise.all([
    supabase.from("tickets").select("*").eq("company_id", companyId).eq("id", ticketId).maybeSingle(),
    supabase.from("ticket_comments").select("id, author_membership_id, author_is_platform, body, kind, created_at").eq("company_id", companyId).eq("ticket_id", ticketId).order("created_at"),
    memberNames(supabase, companyId),
    supabase.from("departments").select("id, name").eq("company_id", companyId),
  ]);
  if (!t) notFound();
  const names = new Map(members.map((m) => [m.id, m.name]));
  const me = membership.id;
  const isOpen = OPEN.includes(t.status);
  const overdue = isOpen && !!t.due_at && Date.parse(t.due_at) < nowMs();
  const mgr = permissions.has("ticket.manage");
  const assignee = t.assignee_membership_id === me, requester = t.requester_membership_id === me;
  const dept = (depts ?? []).find((d) => d.id === t.assignee_department_id)?.name;
  const rel = t.related_type && t.related_id && RELATED[t.related_type] ? RELATED[t.related_type]!(companyId, t.related_id) : null;

  return (
    <>
      <p><Link href={`/c/${companyId}/tasks`}>← My work</Link></p>
      <h1><span className="mono muted">{t.code}</span> {t.title}</h1>
      {sp.e && <div className="notice error">{sp.e}</div>}
      {sp.ok && <div className="notice ok">{sp.ok}</div>}
      <div className="card">
        <dl className="kv" data-testid="ticket-facts">
          <div><dt>Status</dt><dd><span className={`badge ${statusBadge(t.status, overdue)}`}>{overdue ? "Overdue" : STATUS[t.status]}</span>
            {t.reminder_count > 0 && isOpen && <span className="muted small"> · reminder {t.reminder_count}</span>}
            {t.escalated_at && <span className="badge danger" style={{ marginLeft: 6 }}>escalated to {names.get(t.escalated_to_membership_id ?? "") ?? "the department head"}</span>}</dd></div>
          <div><dt>Kind · priority</dt><dd>{KIND[t.kind]} · <span className={`badge ${priorityBadge(t.priority)}`}>{PRIORITY[t.priority]}</span></dd></div>
          <div><dt>Raised by</dt><dd>{names.get(t.requester_membership_id ?? "") ?? "System"} on {fmtDate(t.created_at)}</dd></div>
          <div><dt>With</dt><dd>{t.to_platform ? "Platform team" : names.get(t.assignee_membership_id ?? "") ?? `${dept ?? "Department"} (not yet assigned to a person)`}</dd></div>
          <div><dt>Due</dt><dd>{fmtDate(t.due_at)}</dd></div>
          {rel && <div><dt>About</dt><dd><Link href={rel}>{t.related_label ?? "Open the related item"}</Link></dd></div>}
          {t.resolution && <div><dt>Resolution</dt><dd>{t.resolution}</dd></div>}
        </dl>
        {t.description && <p style={{ whiteSpace: "pre-wrap", marginBottom: 0 }}>{t.description}</p>}
      </div>

      <h2 id="thread">Conversation</h2>
      <div className="chat" data-testid="thread">
        {(thread ?? []).length === 0 && <p className="muted small">No messages yet.</p>}
        {(thread ?? []).map((c) => c.kind !== "comment"
          ? <div key={c.id} className="muted small" style={{ textAlign: "center" }}>{c.body} · {fmtDate(c.created_at)}</div>
          : <div key={c.id} className={`bubble ${c.author_membership_id === me ? "me" : "bot"}`}>
              <div className="small" style={{ fontWeight: 600, marginBottom: 2 }}>{c.author_is_platform ? "Platform team" : names.get(c.author_membership_id ?? "") ?? "Member"}</div>
              <span style={{ whiteSpace: "pre-wrap" }}>{c.body}</span>
              <div className="small" style={{ opacity: .75, marginTop: 4 }}>{fmtDate(c.created_at)}</div>
            </div>)}
      </div>
      <form action={commentTicket.bind(null, companyId, ticketId)} className="row" style={{ alignItems: "flex-end", flexWrap: "nowrap", marginTop: 10 }}>
        <textarea name="body" required aria-label="Write a message" placeholder="Write a message…" rows={2} />
        <button type="submit">Send</button>
      </form>

      <h2>Update</h2>
      <div className="card row" data-testid="ticket-actions" style={{ alignItems: "flex-end" }}>
        {isOpen && (assignee || mgr) && !t.to_platform && t.status !== "in_progress" &&
          <form action={setTicketStatus.bind(null, companyId, ticketId)}><input type="hidden" name="status" value="in_progress" /><button type="submit" className="secondary">Start</button></form>}
        {isOpen && (assignee || mgr) && !t.to_platform && t.status !== "waiting" &&
          <form action={setTicketStatus.bind(null, companyId, ticketId)}><input type="hidden" name="status" value="waiting" /><button type="submit" className="secondary">Waiting on someone</button></form>}
        {isOpen && (assignee || mgr || (requester && !t.to_platform)) && !t.to_platform && (
          <form action={setTicketStatus.bind(null, companyId, ticketId)} className="grow">
            <input type="hidden" name="status" value={assignee || mgr ? "resolved" : "closed"} />
            <label htmlFor="res" style={{ marginTop: 0 }}>How was it done?</label>
            <div className="row" style={{ flexWrap: "nowrap" }}><input id="res" name="resolution" required minLength={3} placeholder="e.g. Sheet updated and shared with the team" />
              <button type="submit">{assignee || mgr ? "Mark done" : "Close"}</button></div>
          </form>)}
        {isOpen && requester && <form action={setTicketStatus.bind(null, companyId, ticketId)}><input type="hidden" name="status" value="cancelled" /><button type="submit" className="secondary">Cancel</button></form>}
        {!isOpen && (requester || mgr) && <form action={setTicketStatus.bind(null, companyId, ticketId)}><input type="hidden" name="status" value="open" /><button type="submit" className="secondary">Re-open</button></form>}
        {isOpen && t.to_platform && <p className="muted small" style={{ margin: 0 }}>The platform team updates this ticket; reply in the conversation above.</p>}
      </div>
      {mgr && isOpen && !t.to_platform && (
        <form action={assignTicket.bind(null, companyId, ticketId)} className="card" data-testid="reassign">
          <strong>Re-assign</strong>
          <div className="grid2">
            <div><label htmlFor="as">Person</label><select id="as" name="assignee" required defaultValue={t.assignee_membership_id ?? ""}>
              <option value="" disabled>Choose…</option>{members.filter((m) => m.status === "active").map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></div>
            <div><label htmlFor="due2">New due date (optional)</label><input id="due2" name="due" type="date" /></div>
          </div>
          <button type="submit" className="secondary" style={{ marginTop: 10 }}>Re-assign</button>
        </form>)}
    </>
  );
}
