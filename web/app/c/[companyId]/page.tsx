import Link from "next/link";
import { requireMembership } from "@/lib/session";
import { fmtDate } from "@/lib/names";
import { nowMs } from "@/lib/time";
import { badges, firstName, greeting, type Impact } from "@/lib/recognition";
import { markRead } from "./requests/actions";

const ASSIGNMENT_LABEL: Record<string, string> = {
  invited: "Not started", accepted: "Not started", in_progress: "In progress", completed: "Completed",
  declined: "Declined", expired: "Expired", cancelled: "Cancelled",
};

export default async function CompanyHome({ params }: { params: Promise<{ companyId: string }> }) {
  const { companyId } = await params;
  const { supabase, userId, membership, permissions } = await requireMembership(companyId);

  await supabase.rpc("my_discovery_assignment", { p_company: companyId }); // idempotent: existing members get the conversation too
  const [{ data: assignments }, { data: impactRaw }, { data: notes }, { data: forMe }, { data: me }, { count: myTasks }, { data: reviews }, docCount] = await Promise.all([
    supabase
      .from("interview_assignments")
      .select("id, status, due_on, department_id, process_id, interview_campaigns(name, purpose, due_on, interview_mode), departments(name), processes(code, name), interview_sessions(id)")
      .eq("company_id", companyId)
      .eq("respondent_membership_id", membership.id)
      .order("created_at", { ascending: false }),
    supabase.rpc("my_impact", { p_company: companyId }),
    supabase.from("notifications").select("id, title, object_type, object_id, created_at").eq("company_id", companyId)
      .eq("recipient_membership_id", membership.id).is("read_at", null).order("created_at", { ascending: false }).limit(20),
    supabase.from("clarification_tasks").select("id, code, question_text, due_at").eq("company_id", companyId)
      .eq("assignee_membership_id", membership.id).in("status", ["open", "assigned", "escalated"]).order("created_at"),
    supabase.from("user_profiles").select("display_name").eq("id", userId).maybeSingle(),
    supabase.from("tickets").select("id", { count: "exact", head: true }).eq("company_id", companyId).eq("assignee_membership_id", membership.id).in("status", ["open", "in_progress", "waiting"]),
    supabase.rpc("my_doc_reviews", { p_company: companyId }),
    permissions.has("org.manage") ? supabase.from("source_documents").select("id", { count: "exact", head: true }).eq("company_id", companyId) : Promise.resolve({ count: null }),
  ]);
  const reviewOpen = ((reviews ?? []) as { open: number }[]).reduce((n, r) => n + r.open, 0);
  const impact = impactRaw as unknown as Impact | null;
  const link = (t: string | null, id: string | null) => t === "dispute" ? `/c/${companyId}/disputes/${id}` : t === "ticket" ? `/c/${companyId}/tasks/${id}`
    : t === "digest" ? `/c/${companyId}/tasks` : `/c/${companyId}/requests/${id}`;


  return (
    <>
      {(() => {
        const disc = assignments?.find((a) => a.interview_campaigns?.interview_mode === "discovery" && !["declined", "expired", "cancelled", "completed"].includes(a.status));
        const next = myTasks ? { text: `You have ${myTasks} task${myTasks === 1 ? "" : "s"} waiting`, cta: "Open my work", href: `/c/${companyId}/tasks` }
          : forMe?.length ? { text: `${forMe.length} colleague${forMe.length === 1 ? " is" : "s are"} waiting for your answer`, cta: "Reply now", href: `/c/${companyId}/requests/${forMe[0]!.id}` }
          : reviewOpen ? { text: `${reviewOpen} point${reviewOpen === 1 ? "" : "s"} from your department's documents need your view`, cta: "Review now", href: `/c/${companyId}/my-review` }
          : permissions.has("org.manage") && docCount.count === 0 ? { text: "Start with the documents you already have — policies, SOPs, letters, forms. We'll map what exists and what is missing", cta: "Bring documents", href: `/c/${companyId}/documents` }
          : disc ? { text: "Your knowledge is the most valuable input — tell us how your work really happens", cta: disc.interview_sessions?.[0] ? "Continue conversation" : "Start conversation", href: `/c/${companyId}/interviews/${disc.id}` }
          : permissions.has("dashboard.read") ? { text: "You're all caught up. See how the company is doing", cta: "Open dashboard", href: `/c/${companyId}/dashboard` }
          : { text: "You're all caught up — thank you", cta: "Browse processes", href: `/c/${companyId}/catalogue` };
        return (
          <section className="welcome" data-testid="welcome">
            <div>
              <h1 style={{ margin: 0 }}>{greeting(nowMs())}, {firstName(me?.display_name)} 👋</h1>
              <p className="muted" style={{ margin: "4px 0 0" }}>{membership.job_title ?? "Member"} · {membership.companies?.name}</p>
              <p style={{ margin: "12px 0 0", fontSize: "1.05rem" }}>{next.text}</p>
            </div>
            <Link className="button big" href={next.href} data-testid="next-action">{next.cta} →</Link>
          </section>);
      })()}

      {impact && (() => {
        const i = impact.me; const c = impact.company; const earned = badges(i);
        const pct = c.interviews_assigned ? Math.round((100 * c.interviews_done) / c.interviews_assigned) : 0;
        return (
          <section className="impact" data-testid="impact">
            <div className="impact-me">
              <h2 style={{ margin: "0 0 8px" }}>Your contribution</h2>
              <div className="impact-tiles">
                <div><strong>{i.answers}</strong><span>answers shared</span></div>
                <div><strong>{i.processes_described}</strong><span>processes you described</span></div>
                <div><strong>{i.colleagues_helped}</strong><span>colleagues helped</span></div>
                <div><strong>{i.tasks_resolved}</strong><span>tasks resolved</span></div>
              </div>
              {earned.length > 0 ? (
                <div className="badges" data-testid="badges">{earned.map((x) => <span key={x.title} className="earned" title={x.why}>{x.icon} {x.title}</span>)}</div>
              ) : <p className="small muted" style={{ marginBottom: 0 }}>Your first answer earns your first badge. Every answer makes the company&rsquo;s way of working clearer for everyone.</p>}
            </div>
            <div className="impact-company">
              <h2 style={{ margin: "0 0 8px" }}>What we&rsquo;re building together</h2>
              <p style={{ margin: "0 0 6px" }}><strong>{c.processes}</strong> processes mapped · <strong>{c.validated}</strong> validated · <strong>{c.documents}</strong> documents approved</p>
              <div className="small muted">Interviews completed: {c.interviews_done} of {c.interviews_assigned}</div>
              <div className="bar"><div style={{ width: `${pct}%` }} /></div>
              <div className="small muted">{c.contributors_30d} of {c.people} colleagues contributed in the last 30 days{i.score_30d > 0 ? " — including you. Thank you!" : "."}</div>
            </div>
          </section>);
      })()}

      {!!notes?.length && (
        <div className="card">
          <div className="row" style={{ justifyContent: "space-between" }}><strong>🔔 {notes.length} new</strong>
            <form action={markRead.bind(null, companyId)}><button type="submit" className="secondary" style={{ padding: "2px 10px" }}>Mark all read</button></form></div>
          <ul style={{ margin: "8px 0 0" }}>{notes.slice(0, 5).map((n) => <li key={n.id}><Link href={link(n.object_type, n.object_id)}>{n.title}</Link> <span className="muted small">{fmtDate(n.created_at)}</span></li>)}</ul>
          {notes.length > 5 && <details><summary className="small">Show {notes.length - 5} more</summary>
            <ul style={{ margin: "4px 0 0" }}>{notes.slice(5).map((n) => <li key={n.id}><Link href={link(n.object_type, n.object_id)}>{n.title}</Link> <span className="muted small">{fmtDate(n.created_at)}</span></li>)}</ul></details>}
        </div>
      )}

      {!!forMe?.length && (<>
        <h2>Questions waiting for your reply ({forMe.length})</h2>
        {forMe.map((t) => (
          <div key={t.id} className="card row">
            <div className="grow">{t.question_text}<div className="muted small">{t.code}{t.due_at ? ` · reply by ${fmtDate(t.due_at)}` : ""}</div></div>
            <Link className="button" href={`/c/${companyId}/requests/${t.id}`}>Reply</Link>
          </div>
        ))}
      </>)}

      {(() => {
        const d = assignments?.find((a) => a.interview_campaigns?.interview_mode === "discovery" && !["declined", "expired", "cancelled"].includes(a.status));
        if (!d) return null;
        const sid = d.interview_sessions?.[0]?.id;
        const done = d.status === "completed";
        if (!sid && !done) return null;   // not started yet: the welcome banner already offers "Start conversation"
        return (
          <div className="card hero" data-testid="discovery-card">
            <h2 style={{ marginTop: 0 }}>Let&rsquo;s understand the work you do.</h2>
            <p className="muted">A guided conversation about your role, your responsibilities and the work you handle. Just explain your work naturally — the AI organises it into your profile, activities and process maps.</p>
            <div className="row">
              {!done && <Link className="button" href={`/c/${companyId}/interviews/${d.id}`}>{sid ? "Continue conversation" : "Start conversation"}</Link>}
              {sid && <Link className={done ? "button" : "button secondary"} href={`/c/${companyId}/work/${sid}`}>What we understood</Link>}
              {done && <span className="badge ok">Submitted</span>}
            </div>
          </div>
        );
      })()}

      <h2>My interviews</h2>
      {!assignments?.length && <p className="muted">No interviews are assigned to you.</p>}
      {assignments?.map((a) => (
        <div key={a.id} className="card row">
          <div className="grow">
            <strong>{a.interview_campaigns?.name ?? "Interview"}</strong>{" "}
            <span className={`badge ${a.status === "completed" ? "ok" : a.status === "in_progress" ? "warn" : ""}`}>
              {ASSIGNMENT_LABEL[a.status] ?? a.status}
            </span>
            <div className="muted small">
              {a.processes ? `Process ${a.processes.code} · ${a.processes.name}` : `Department · ${a.departments?.name ?? ""}`}
              {(a.due_on ?? a.interview_campaigns?.due_on) && ` · due ${a.due_on ?? a.interview_campaigns?.due_on}`}
            </div>
          </div>
          {["invited", "accepted", "in_progress"].includes(a.status) && (
            <Link className="button" href={`/c/${companyId}/interviews/${a.id}`}>
              {a.status === "in_progress" ? "Resume" : "Start"}
            </Link>
          )}
          {a.status === "completed" && <Link href={`/c/${companyId}/interviews/${a.id}`}>View</Link>}
          {a.interview_campaigns?.interview_mode === "discovery" && a.interview_sessions?.[0] && (
            <Link href={`/c/${companyId}/work/${a.interview_sessions[0].id}`}>What we understood</Link>
          )}
        </div>
      ))}

      {permissions.has("dashboard.read") && (
        <div className="card row" data-testid="dashboard-card">
          <div className="grow"><strong>Company dashboard</strong><div className="muted small">Progress by department, what needs attention, and this month&rsquo;s champions.</div></div>
          <Link className="button secondary" href={`/c/${companyId}/dashboard`}>Open dashboard</Link>
        </div>)}
    </>
  );
}
