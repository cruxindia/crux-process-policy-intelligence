import Link from "next/link";
import { requirePlatformAdmin } from "@/lib/session";
import { fmtDate } from "@/lib/names";
import { KIND, PRIORITY, STATUS, priorityBadge, statusBadge } from "@/lib/tickets";

export default async function PlatformTickets({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const { supabase } = await requirePlatformAdmin();
  const all = sp.all === "1";
  const { data } = await supabase.rpc("platform_tickets", { p_open_only: !all });
  const rows = data ?? [];
  return (
    <>
      <h1>Support &amp; billing tickets</h1>
      <p className="muted">Help requests and invoice disputes from every company. {all ? <a href="?">Open only</a> : <a href="?all=1">Show all</a>}</p>
      {rows.length === 0 ? <p className="muted" data-testid="empty">No {all ? "" : "open "}tickets. </p> : (
        <div className="table-wrap card" style={{ padding: 0 }}>
          <table data-testid="platform-tickets">
            <thead><tr><th>Ticket</th><th>Company</th><th>What</th><th>Kind</th><th>Priority</th><th>Status</th><th>From</th><th>Opened</th><th className="num">Messages</th></tr></thead>
            <tbody>{rows.map((t) => (
              <tr key={t.ticket_id}>
                <td><Link className="mono" href={`/platform/tickets/${t.company_id}/${t.ticket_id}`}>{t.code}</Link></td>
                <td>{t.company_name}</td>
                <td style={{ whiteSpace: "normal", minWidth: 200 }}>{t.title}</td>
                <td className="small">{KIND[t.kind]}</td>
                <td><span className={`badge ${priorityBadge(t.priority)}`}>{PRIORITY[t.priority]}</span></td>
                <td><span className={`badge ${statusBadge(t.status, false)}`}>{STATUS[t.status]}</span></td>
                <td className="small">{t.requester}</td>
                <td className="small">{fmtDate(t.created_at)}</td>
                <td className="num">{t.comments}</td>
              </tr>))}
            </tbody>
          </table>
        </div>)}
    </>
  );
}
