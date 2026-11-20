import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePlatformAdmin } from "@/lib/session";
import { fmtDate } from "@/lib/names";
import { KIND, OPEN, PRIORITY, STATUS, priorityBadge, statusBadge } from "@/lib/tickets";
import { platformReply, platformStatus } from "../../../actions";

export default async function PlatformTicket({ params, searchParams }: { params: Promise<{ companyId: string; ticketId: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { companyId, ticketId } = await params;
  const sp = await searchParams;
  const { supabase } = await requirePlatformAdmin();
  const [{ data: t }, { data: thread }, { data: list }] = await Promise.all([
    supabase.from("tickets").select("*").eq("company_id", companyId).eq("id", ticketId).maybeSingle(),
    supabase.from("ticket_comments").select("id, author_is_platform, body, kind, created_at").eq("ticket_id", ticketId).order("created_at"),
    supabase.rpc("platform_tickets", { p_open_only: false }),
  ]);
  if (!t) notFound();
  const meta = (list ?? []).find((x) => x.ticket_id === ticketId);
  const open = OPEN.includes(t.status);
  return (
    <>
      <p><Link href="/platform/tickets">← Tickets</Link></p>
      <h1><span className="mono muted">{t.code}</span> {t.title}</h1>
      {sp.e && <div className="notice error">{sp.e}</div>}
      {sp.ok && <div className="notice ok">{sp.ok}</div>}
      <div className="card">
        <dl className="kv">
          <div><dt>Company</dt><dd>{meta?.company_name}</dd></div>
          <div><dt>From</dt><dd>{meta?.requester} on {fmtDate(t.created_at)}</dd></div>
          <div><dt>Kind · priority</dt><dd>{KIND[t.kind]} · <span className={`badge ${priorityBadge(t.priority)}`}>{PRIORITY[t.priority]}</span></dd></div>
          <div><dt>Status</dt><dd><span className={`badge ${statusBadge(t.status, false)}`}>{STATUS[t.status]}</span></dd></div>
          {t.related_label && <div><dt>About</dt><dd>{t.related_label}</dd></div>}
          {t.resolution && <div><dt>Resolution</dt><dd>{t.resolution}</dd></div>}
        </dl>
        {t.description && <p style={{ whiteSpace: "pre-wrap", marginBottom: 0 }}>{t.description}</p>}
      </div>
      <h2>Conversation</h2>
      <div className="chat" data-testid="thread">
        {(thread ?? []).map((c) => c.kind !== "comment"
          ? <div key={c.id} className="muted small" style={{ textAlign: "center" }}>{c.body} · {fmtDate(c.created_at)}</div>
          : <div key={c.id} className={`bubble ${c.author_is_platform ? "me" : "bot"}`}><span style={{ whiteSpace: "pre-wrap" }}>{c.body}</span>
              <div className="small" style={{ opacity: .75, marginTop: 4 }}>{c.author_is_platform ? "You" : meta?.company_name} · {fmtDate(c.created_at)}</div></div>)}
      </div>
      <form action={platformReply.bind(null, companyId, ticketId)} className="row" style={{ alignItems: "flex-end", flexWrap: "nowrap", marginTop: 10 }}>
        <textarea name="body" required aria-label="Reply" placeholder="Reply to the company…" rows={2} /><button type="submit">Send</button>
      </form>
      <form action={platformStatus.bind(null, companyId, ticketId)} className="card row" style={{ alignItems: "flex-end" }}>
        <div><label htmlFor="ps" style={{ marginTop: 0 }}>Status</label>
          <select id="ps" name="status" defaultValue={open ? "resolved" : "open"} style={{ width: 160 }}>
            {(open ? ["in_progress", "waiting", "resolved", "closed"] : ["open"]).map((k) => <option key={k} value={k}>{STATUS[k]}</option>)}</select></div>
        <div className="grow"><label htmlFor="pr" style={{ marginTop: 0 }}>Resolution (needed for resolved/closed)</label><input id="pr" name="resolution" /></div>
        <button type="submit">Update</button>
      </form>
    </>
  );
}
