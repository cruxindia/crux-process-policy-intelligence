import Link from "next/link";

// Company / project dashboard (PPI-042). Figures only — no interview answers or document text.
export type Dash = {
  scope: "company" | "departments";
  people: { active: number; invited: number };
  interviews: { assigned: number; started: number; submitted: number };
  processes: { discovered: number; catalogued: number; performed: number; documented: number; doc_gaps: number; validated: number };
  documents: { approved: number; awaiting: number; in_progress: number; avg_days_to_approval: number | null; released: number } | null;
  work: { open: number; overdue: number; escalated: number; resolved_30d: number; avg_days_to_resolve_30d: number | null };
  questions: { open: number; overdue: number };
  leadership_questions_open: number | null;
  ai_30d: { succeeded: number; failed: number } | null;
  by_department: { id: string; name: string; members: number; assigned: number; submitted: number; processes: number; documented: number; open_work: number; overdue_work: number }[];
  trend: { week: string; answers: number; resolved: number }[];
  champions: { membership_id: string; answers: number; resolved: number; helped: number; score: number }[];
};

const n = (x: number | null | undefined) => (x ?? 0).toLocaleString("en-IN");
const pct = (a: number, b: number) => (b > 0 ? Math.round((100 * a) / b) : 0);

function Spark({ data }: { data: Dash["trend"] }) {
  const W = 320, H = 80, P = 6;
  const max = Math.max(1, ...data.map((d) => Math.max(d.answers, d.resolved)));
  const pts = (k: "answers" | "resolved") => data.map((d, i) => `${P + (i * (W - 2 * P)) / Math.max(1, data.length - 1)},${H - P - ((H - 2 * P) * d[k]) / max}`).join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Weekly activity, last 8 weeks" style={{ width: "100%", maxWidth: 420, height: "auto" }}>
      <polyline points={pts("answers")} fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinejoin="round" />
      <polyline points={pts("resolved")} fill="none" stroke="var(--ok)" strokeWidth="2.5" strokeLinejoin="round" strokeDasharray="5 4" />
    </svg>
  );
}

export function DashboardView({ d, names, base, title }: { d: Dash; names: Map<string, string>; base: string; title?: string }) {
  const iv = d.interviews; const p = d.processes;
  const funnel: [string, number][] = [["Found in interviews", p.discovered], ["In the process register", p.catalogued], ["Performed today", p.performed], ["Validated by owners", p.validated], ["Has an approved document", p.documented]];
  const top = Math.max(1, ...funnel.map((f) => f[1]));
  const attention: { text: string; href: string }[] = [
    ...(d.work.overdue ? [{ text: `${n(d.work.overdue)} overdue task${d.work.overdue === 1 ? "" : "s"}${d.work.escalated ? ` (${d.work.escalated} escalated)` : ""}`, href: `${base}/reports/workload` }] : []),
    ...(d.questions.overdue ? [{ text: `${n(d.questions.overdue)} colleague request${d.questions.overdue === 1 ? "" : "s"} past due`, href: `${base}/reports/open_questions` }] : []),
    ...(d.people.invited ? [{ text: `${n(d.people.invited)} invited people have not joined yet`, href: `${base}/reports/people_progress` }] : []),
    ...(iv.assigned - iv.submitted > 0 ? [{ text: `${n(iv.assigned - iv.submitted)} interviews still to complete`, href: `${base}/reports/participation` }] : []),
    ...(p.doc_gaps ? [{ text: `${n(p.doc_gaps)} processes are performed but have no approved document`, href: `${base}/reports/discovery_funnel` }] : []),
    ...(d.leadership_questions_open ? [{ text: `${n(d.leadership_questions_open)} leadership questions open for the blueprint`, href: `${base}/blueprint?tab=questions` }] : []),
  ];
  const contributors = d.champions.length;
  return (
    <div data-testid="dashboard">
      <div className="hero-strip" data-testid="hero">
        <div>
          <div className="hero-big">{n(p.catalogued)} processes mapped · {n(p.documented)} documented</div>
          <div className="muted">{n(iv.submitted)} of {n(iv.assigned)} interviews complete ({pct(iv.submitted, iv.assigned)}%) · {n(d.work.resolved_30d)} tasks resolved in 30 days
            {contributors > 0 && <> · <strong>{contributors}</strong> standout contributor{contributors === 1 ? "" : "s"} this month</>}</div>
        </div>
        {title && <span className="badge">{title}</span>}
      </div>

      <div className="kpis" data-testid="dash-kpis">
        <div className="kpi"><div className="kpi-label">People taking part</div><div className="kpi-value">{n(d.people.active)}</div><div className="kpi-sub">{n(d.people.invited)} invited, not joined</div></div>
        <div className={`kpi ${iv.assigned && iv.submitted === iv.assigned ? "good" : ""}`}><div className="kpi-label">Interviews completed</div><div className="kpi-value">{pct(iv.submitted, iv.assigned)}%</div><div className="kpi-sub">{n(iv.submitted)} of {n(iv.assigned)} · {n(iv.started - iv.submitted)} in progress</div></div>
        <div className="kpi"><div className="kpi-label">Processes validated</div><div className="kpi-value">{n(p.validated)}</div><div className="kpi-sub">of {n(p.catalogued)} in the register</div></div>
        <div className={`kpi ${p.doc_gaps ? "attn" : "good"}`}><div className="kpi-label">Documentation gaps</div><div className="kpi-value">{n(p.doc_gaps)}</div><div className="kpi-sub">performed, no approved document</div></div>
        {d.documents && <div className="kpi"><div className="kpi-label">Documents approved</div><div className="kpi-value">{n(d.documents.approved)}</div><div className="kpi-sub">{n(d.documents.awaiting)} awaiting · {n(d.documents.released)} shared{d.documents.avg_days_to_approval !== null ? ` · ${d.documents.avg_days_to_approval} days avg` : ""}</div></div>}
        <div className={`kpi ${d.work.overdue ? "attn" : ""}`}><div className="kpi-label">Open tasks</div><div className="kpi-value">{n(d.work.open)}</div><div className="kpi-sub">{n(d.work.overdue)} overdue{d.work.avg_days_to_resolve_30d !== null ? ` · ${d.work.avg_days_to_resolve_30d} days to resolve` : ""}</div></div>
        <div className={`kpi ${d.questions.overdue ? "attn" : ""}`}><div className="kpi-label">Open questions</div><div className="kpi-value">{n(d.questions.open)}</div><div className="kpi-sub">{n(d.questions.overdue)} past due</div></div>
      </div>

      <div className="grid2" style={{ alignItems: "start" }}>
        <section className="card" data-testid="funnel">
          <h2 style={{ marginTop: 0 }}>From conversation to documented process</h2>
          {funnel.map(([label, v]) => (
            <div className="meter" key={label}><span className="small">{label}</span><strong className="small">{n(v)}</strong>
              <div className="bar" style={{ gridColumn: "1 / -1" }}><div style={{ width: `${(100 * v) / top}%` }} /></div></div>))}
        </section>
        <section className="card" data-testid="attention">
          <h2 style={{ marginTop: 0 }}>Needs attention</h2>
          {attention.length === 0 ? <p className="muted">Nothing is waiting. Everything is on track — well done.</p>
            : <ul style={{ margin: 0, paddingLeft: 18 }}>{attention.map((a) => <li key={a.text} style={{ margin: "4px 0" }}><Link href={a.href}>{a.text}</Link></li>)}</ul>}
          <h2>Activity, last 8 weeks</h2>
          <Spark data={d.trend} />
          <div className="small muted"><span style={{ color: "var(--accent)" }}>━</span> interview answers &nbsp; <span style={{ color: "var(--ok)" }}>┅</span> tasks resolved</div>
        </section>
      </div>

      {d.champions.length > 0 && (
        <section className="card" data-testid="champions">
          <h2 style={{ marginTop: 0 }}>Thank you — this month&rsquo;s champions</h2>
          <div className="champions">{d.champions.map((c, i) => (
            <div className="champion" key={c.membership_id}>
              <div className="champion-rank">{["🥇", "🥈", "🥉"][i] ?? "⭐"}</div>
              <div><strong>{names.get(c.membership_id) ?? "A colleague"}</strong>
                <div className="small muted">{[c.answers && `${c.answers} answer${c.answers === 1 ? "" : "s"}`, c.resolved && `${c.resolved} task${c.resolved === 1 ? "" : "s"} solved`, c.helped && `helped ${c.helped} colleague${c.helped === 1 ? "" : "s"}`].filter(Boolean).join(" · ")}</div></div>
            </div>))}</div>
        </section>)}

      <section className="card" style={{ padding: 0 }}>
        <div className="table-wrap"><table data-testid="dept-table">
          <thead><tr><th>Department</th><th className="num">People</th><th>Interviews</th><th className="num">Processes</th><th className="num">Documented</th><th className="num">Open tasks</th></tr></thead>
          <tbody>{d.by_department.map((r) => (
            <tr key={r.id}>
              <td>{r.name}</td><td className="num">{n(r.members)}</td>
              <td style={{ minWidth: 150 }}><div className="small">{n(r.submitted)} of {n(r.assigned)}</div><div className="bar thin"><div style={{ width: `${pct(r.submitted, r.assigned)}%` }} /></div></td>
              <td className="num">{n(r.processes)}</td><td className="num">{n(r.documented)}</td>
              <td className="num">{n(r.open_work)}{r.overdue_work > 0 && <span className="badge warn" style={{ marginLeft: 6 }}>{r.overdue_work} late</span>}</td>
            </tr>))}</tbody>
        </table></div>
      </section>
    </div>
  );
}
