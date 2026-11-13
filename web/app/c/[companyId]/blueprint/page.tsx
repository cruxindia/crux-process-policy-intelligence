import Link from "next/link";
import { requireMembership } from "@/lib/session";
import { fmtDate, memberNames } from "@/lib/names";
import { AREAS, CORE, CTQ_STATUS, DIRECTION_LABEL, SECTION_LABEL, SECTIONS, SOURCE_LABEL, VOICES, VOICE_SHORT } from "@/lib/blueprint-ui";
import { addEntry, answerQuestion, assignQuestion, decideEntry, decideTarget, publish, requestTarget, retireCtq, saveCtq, startLeadership } from "./actions";
import { SynthesisButton } from "./synthesis";

type Content = { sections?: Record<string, string[]>; ctqs?: { code: string; name: string; voice: string; measure: string; unit: string | null; target_value: number | null; target_text: string | null }[] };
const TABS = ["overview", "review", "ctq", "questions", "leadership"] as const;

export default async function BlueprintPage({ params, searchParams }: {
  params: Promise<{ companyId: string }>; searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { companyId } = await params;
  const sp = await searchParams;
  const { supabase, permissions, membership } = await requireMembership(companyId);
  const canManage = permissions.has("blueprint.manage");
  const canApprove = permissions.has("blueprint.approve");
  const curator = canManage || canApprove;
  const tab = (TABS as readonly string[]).includes(sp.tab ?? "") && (curator || sp.tab === "questions") ? sp.tab! : "overview";

  const [{ data: versions }, { data: entries }, { data: ctqs }, { data: questions }, { data: runs }, { data: camp }] = await Promise.all([
    supabase.from("blueprint_versions").select("version, content, note, published_by, published_at").eq("company_id", companyId).order("version", { ascending: false }).limit(5),
    supabase.from("blueprint_entries").select("id, section, statement, original_statement, source_kind, source_refs, status, decided_by, decided_at, decision_note, created_at")
      .eq("company_id", companyId).neq("status", "rejected").order("created_at"),
    supabase.from("ctq_items").select("*").eq("company_id", companyId).order("code"),
    supabase.from("blueprint_open_questions").select("id, section, question, status, assigned_to, answer, answered_by, answered_at").eq("company_id", companyId)
      .order("created_at"),
    curator ? supabase.from("blueprint_syntheses").select("id, status, counts, error_text, started_at, finished_at").eq("company_id", companyId).order("started_at", { ascending: false }).limit(3)
      : Promise.resolve({ data: [] as { id: string; status: string; counts: unknown; error_text: string | null; started_at: string; finished_at: string | null }[] }),
    supabase.from("interview_campaigns").select("id").eq("company_id", companyId).eq("purpose_kind", "leadership").maybeSingle(),
  ]);
  const { names, members } = await memberNames(supabase, companyId);
  const { data: leaders } = camp ? await supabase.from("interview_assignments").select("id, respondent_membership_id, status").eq("company_id", companyId).eq("campaign_id", camp.id)
    : { data: [] as { id: string; respondent_membership_id: string; status: string }[] };
  const latest = versions?.[0];
  const content = (latest?.content ?? {}) as Content;
  const confirmed = (entries ?? []).filter((e) => e.status === "confirmed");
  const proposed = (entries ?? []).filter((e) => e.status === "proposed");
  const bySection = (list: typeof confirmed) => new Map(SECTIONS.map((sec) => [sec, list.filter((e) => e.section === sec)]));
  const conf = bySection(confirmed), prop = bySection(proposed);
  const missingCore = CORE.filter((c) => !conf.get(c)?.length);
  const open = (questions ?? []).filter((q) => q.status === "open");
  const mine = open.filter((q) => q.assigned_to === membership.id);
  const pendingTargets = (ctqs ?? []).filter((c) => c.status === "pending_approval");
  const running = (runs ?? []).some((r) => r.status === "running");
  const lastRun = runs?.[0];
  const counts = (lastRun?.counts ?? {}) as { entries?: number; ctqs?: number; questions?: number; leaders?: number; employee_statements?: number; dropped?: { targets?: number; uncited?: number } };
  const leaderIds = new Set((leaders ?? []).map((l) => l.respondent_membership_id));
  const tabLink = (t: string, label: string) => <Link key={t} href={`/c/${companyId}/blueprint?tab=${t}`} className={tab === t ? "on" : ""} data-testid={`tab-${t}`}>{label}</Link>;

  return (
    <>
      <p><Link href={`/c/${companyId}`}>← Back</Link></p>
      <h1>Company Operating Blueprint</h1>
      <p className="muted">
        The agreed understanding of what the company does, whom it serves, what it wants to achieve and which standards it must meet — built from
        leadership interviews and what employees say, reviewed by management, and used as the foundation of every department document.
      </p>
      {sp.e && <div className="notice error">{sp.e}</div>}
      {sp.ok && <div className="notice ok">{sp.ok}</div>}
      {mine.length > 0 && tab !== "questions" && (
        <div className="notice" data-testid="my-questions">You have {mine.length} question{mine.length === 1 ? "" : "s"} from the blueprint team. <Link href={`/c/${companyId}/blueprint?tab=questions`}>Answer them</Link></div>)}

      <nav className="tabs" style={{ margin: "16px 0" }}>
        {[tabLink("overview", latest ? `Blueprint v${latest.version}` : "Blueprint"),
          ...(curator ? [" · ", tabLink("review", `Review (${proposed.length})`), " · ", tabLink("ctq", `CTQs (${(ctqs ?? []).filter((c) => !["rejected", "retired"].includes(c.status)).length})`)] : []),
          " · ", tabLink("questions", `Open questions (${curator ? open.length : mine.length})`),
          ...(curator ? [" · ", tabLink("leadership", `Leadership interviews (${leaders?.length ?? 0})`)] : [])]}
      </nav>

      {tab === "overview" && (<>
        {curator && (
          <section className="card" id="overview">
            <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
              <div>
                <strong>Where the engagement stands</strong>
                <div className="small muted">
                  {leaders?.length ?? 0} leader interview{leaders?.length === 1 ? "" : "s"} · {confirmed.length} agreed statements · {proposed.length} waiting for review ·
                  {" "}{(ctqs ?? []).filter((c) => c.status === "approved").length} CTQs with approved targets · {open.length} open questions
                </div>
                {lastRun && <div className="small" data-testid="last-run">Last AI synthesis: {lastRun.status === "running" ? "running now" : lastRun.status === "succeeded"
                  ? `${fmtDate(lastRun.finished_at ?? lastRun.started_at)} — ${counts.entries ?? 0} statements, ${counts.ctqs ?? 0} CTQs, ${counts.questions ?? 0} questions proposed from ${counts.leaders ?? 0} leader interview(s) and ${counts.employee_statements ?? 0} employee statements${counts.dropped?.targets ? `; ${counts.dropped.targets} invented target(s) refused` : ""}`
                  : `failed — ${lastRun.error_text ?? "unknown error"}`}</div>}
              </div>
              {canManage && <SynthesisButton companyId={companyId} running={running} />}
            </div>
            <div className="table-wrap" style={{ marginTop: 12 }}><table className="wrap small" data-testid="readiness">
              <thead><tr><th>Area</th><th>Agreed</th><th>To review</th></tr></thead>
              <tbody>{SECTIONS.map((sec) => (
                <tr key={sec}><td>{SECTION_LABEL[sec]}{CORE.includes(sec) && <span className="muted"> · core</span>}</td>
                  <td>{conf.get(sec)?.length ? <span className="badge ok">{conf.get(sec)!.length}</span> : <span className={`badge ${CORE.includes(sec) ? "warn" : ""}`}>0</span>}</td>
                  <td>{prop.get(sec)?.length || ""}</td></tr>))}</tbody>
            </table></div>
            {canApprove && (
              <form action={publish.bind(null, companyId)} className="row" style={{ gap: 8, flexWrap: "wrap", marginTop: 12 }} data-testid="publish-form">
                <input name="note" placeholder="What changed (optional)" aria-label="Version note" style={{ maxWidth: 360 }} />
                <button type="submit" disabled={missingCore.length > 0}>Publish version {(latest?.version ?? 0) + 1}</button>
                {missingCore.length > 0 && <span className="small muted">Agree at least one statement for: {missingCore.map((c) => SECTION_LABEL[c]).join(", ")}.</span>}
              </form>)}
          </section>)}

        {!latest ? <p className="muted" data-testid="no-version">No version has been published yet.{curator ? " Review the AI's proposals, then publish." : " Management is preparing it."}</p> : (
          <section data-testid="published">
            <h2>Version {latest.version} <span className="muted small">— published {fmtDate(latest.published_at)} by {names.get(latest.published_by) ?? "management"}{latest.note ? ` · ${latest.note}` : ""}</span></h2>
            {[["The company", AREAS], ["The four voices", VOICES]].map(([title, secs]) => (
              <div key={title as string}>
                <h3>{title as string}</h3>
                <dl className="kv">{(secs as string[]).filter((sec) => content.sections?.[sec]?.length).map((sec) => (
                  <div key={sec} style={{ display: "contents" }}><dt>{SECTION_LABEL[sec]}</dt>
                    <dd>{content.sections![sec]!.length === 1 ? content.sections![sec]![0] : <ul style={{ margin: 0, paddingLeft: 18 }}>{content.sections![sec]!.map((t, i) => <li key={i}>{t}</li>)}</ul>}</dd></div>))}</dl>
              </div>))}
            <h3>Critical to quality — approved measures and targets</h3>
            {!content.ctqs?.length ? <p className="muted">No CTQ targets approved yet.</p> : (
              <div className="table-wrap"><table className="wrap small"><thead><tr><th>CTQ</th><th>Voice</th><th>Measure</th><th>Target</th></tr></thead>
                <tbody>{content.ctqs.map((c) => <tr key={c.code}><td>{c.code} · {c.name}</td><td>{VOICE_SHORT[c.voice]}</td><td>{c.measure}</td>
                  <td>{[c.target_value, c.target_text ?? c.unit].filter((x) => x !== null && x !== "").join(" ")}</td></tr>)}</tbody></table></div>)}
          </section>)}
      </>)}

      {tab === "review" && curator && (
        <section id="review">
          <p className="muted small">Each statement the AI consultant proposes cites what it is based on. Confirm (edit the wording if needed) or reject with a reason.
            Only confirmed statements become part of the blueprint.</p>
          {!proposed.length && <p className="muted">Nothing is waiting for review.</p>}
          {SECTIONS.filter((sec) => prop.get(sec)?.length).map((sec) => (
            <div key={sec}><h3>{SECTION_LABEL[sec]}</h3>
              {prop.get(sec)!.map((e) => {
                const refs = (Array.isArray(e.source_refs) ? e.source_refs : []) as { ref?: string; kind?: string; session_id?: string; question?: string }[];
                return (
                  <div key={e.id} className="card" data-testid="proposed-entry">
                    <div className="small muted">{SOURCE_LABEL[e.source_kind] ?? e.source_kind} · based on {refs.length} source{refs.length === 1 ? "" : "s"}
                      {refs.filter((r) => r.session_id).slice(0, 4).map((r, i) => <span key={i}> · <Link href={`/c/${companyId}/work/${r.session_id}`}>{r.kind === "leadership" ? "leader interview" : "employee interview"}</Link></span>)}
                      {refs.find((r) => r.question) && ` · answer to “${refs.find((r) => r.question)!.question}”`}</div>
                    {canManage ? (
                      <form action={decideEntry.bind(null, companyId, e.id)} style={{ marginTop: 6 }}>
                        <textarea name="statement" defaultValue={e.statement} rows={2} aria-label="Statement" />
                        <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
                          <button type="submit" name="decision" value="confirmed">Confirm</button>
                          <input name="note" placeholder="Reason (required to reject)" aria-label="Reason" style={{ maxWidth: 300 }} />
                          <button type="submit" name="decision" value="rejected" className="secondary">Reject</button>
                        </div>
                      </form>) : <p>{e.statement}</p>}
                  </div>);
              })}
            </div>))}
          {canManage && (
            <details className="card"><summary><strong>Add a statement yourself</strong></summary>
              <form action={addEntry.bind(null, companyId)} style={{ marginTop: 8 }}>
                <label htmlFor="section">Area</label>
                <select id="section" name="section">{SECTIONS.map((sec) => <option key={sec} value={sec}>{SECTION_LABEL[sec]}</option>)}</select>
                <label htmlFor="statement">Statement</label><textarea id="statement" name="statement" rows={2} required minLength={3} />
                <button type="submit">Add (counts as agreed)</button>
              </form></details>)}
          <h3>Agreed so far</h3>
          {SECTIONS.filter((sec) => conf.get(sec)?.length).map((sec) => (
            <div key={sec} className="small"><strong>{SECTION_LABEL[sec]}</strong><ul>{conf.get(sec)!.map((e) => <li key={e.id}>{e.statement}
              <span className="muted"> — {names.get(e.decided_by ?? "") ?? "a manager"}{e.original_statement ? " (wording edited)" : ""}</span></li>)}</ul></div>))}
        </section>)}

      {tab === "ctq" && curator && (
        <section id="ctq">
          <p className="muted small">CTQs turn the four voices into measures. The AI proposes <em>what</em> to measure; it never sets a target.
            A manager proposes each target with where it comes from, and a different person approves it.</p>
          {pendingTargets.length > 0 && <div className="notice" data-testid="pending-targets">{pendingTargets.length} target{pendingTargets.length === 1 ? "" : "s"} waiting for approval.</div>}
          <div className="table-wrap"><table className="wrap small" data-testid="ctq-table">
            <thead><tr><th>CTQ</th><th>Voice</th><th>Measure</th><th>Target</th><th>Status</th><th></th></tr></thead>
            <tbody>{(ctqs ?? []).filter((c) => !["rejected", "retired"].includes(c.status)).map((c) => (
              <tr key={c.id}>
                <td>{c.code} · <strong>{c.name}</strong>{c.expectation && <div className="muted">{c.expectation}</div>}</td>
                <td>{VOICE_SHORT[c.voice]}</td>
                <td>{c.measure}{c.unit && <span className="muted"> ({c.unit})</span>}<div className="muted">{DIRECTION_LABEL[c.direction]}{c.baseline ? ` · today: ${c.baseline}` : ""}</div></td>
                <td>{c.target_value !== null || c.target_text ? <>{[c.target_value, c.target_text].filter((x) => x !== null && x !== "").join(" ")}
                  <div className="muted">{c.target_reason} — {names.get(c.target_requested_by ?? "") ?? "a manager"}{c.approved_by ? `; approved by ${names.get(c.approved_by) ?? "a member"}` : ""}</div></> : <span className="muted">—</span>}</td>
                <td><span className={`badge ${c.status === "approved" ? "ok" : c.status === "pending_approval" ? "part" : ""}`}>{CTQ_STATUS[c.status]}</span>
                  {c.decision_note && c.status === "proposed" && <div className="muted">Last decision: {c.decision_note}</div>}</td>
                <td style={{ minWidth: 220 }}>
                  {canApprove && c.status === "pending_approval" && (
                    <form action={decideTarget.bind(null, companyId, c.id)} className="row" style={{ gap: 4, flexWrap: "wrap" }}>
                      <input name="note" placeholder="Note (required to reject)" aria-label="Note" />
                      <button type="submit" name="decision" value="approved">Approve</button>
                      <button type="submit" name="decision" value="rejected" className="secondary">Reject</button>
                    </form>)}
                  {canManage && ["proposed", "approved"].includes(c.status) && (
                    <details><summary className="small">{c.status === "approved" ? "Change target" : "Propose target"}</summary>
                      <form action={requestTarget.bind(null, companyId, c.id)} data-testid="target-form">
                        <input name="target_value" inputMode="decimal" placeholder="Number, e.g. 95" aria-label="Target number" />
                        <input name="target_text" placeholder="Unit or wording, e.g. % within SLA" aria-label="Target text" />
                        <input name="reason" placeholder="Where the target comes from" aria-label="Where the target comes from" required minLength={10} />
                        <button type="submit" className="secondary">Send for approval</button>
                      </form></details>)}
                  {canManage && ["proposed", "approved"].includes(c.status) && (
                    <details><summary className="small">Don&rsquo;t use</summary>
                      <form action={retireCtq.bind(null, companyId, c.id)} className="row" style={{ gap: 4 }}>
                        <input name="note" placeholder="Reason" aria-label="Reason for not using" required minLength={3} /><button type="submit" className="secondary">Remove</button>
                      </form></details>)}
                </td>
              </tr>))}
              {!(ctqs ?? []).length && <tr><td colSpan={6} className="muted">No CTQs yet — run the AI consultant or add one.</td></tr>}</tbody>
          </table></div>
          {canManage && (
            <details className="card"><summary><strong>Add a CTQ</strong></summary>
              <form action={saveCtq.bind(null, companyId)} style={{ marginTop: 8 }}>
                <div className="grid2">
                  <div><label htmlFor="ctq-name">Name</label><input id="ctq-name" name="name" required minLength={3} placeholder="Turnaround time" /></div>
                  <div><label htmlFor="ctq-voice">Voice</label><select id="ctq-voice" name="voice">{VOICES.map((v) => <option key={v} value={v}>{SECTION_LABEL[v]}</option>)}</select></div>
                  <div><label htmlFor="ctq-unit">Unit (optional)</label><input id="ctq-unit" name="unit" placeholder="% of cases" /></div>
                  <div><label htmlFor="ctq-dir">Direction</label><select id="ctq-dir" name="direction">{Object.entries(DIRECTION_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
                </div>
                <label htmlFor="ctq-measure">What is measured, and how</label><input id="ctq-measure" name="measure" required minLength={3} />
                <label htmlFor="ctq-exp">Expectation it serves (optional)</label><input id="ctq-exp" name="expectation" />
                <label htmlFor="ctq-base">Today&rsquo;s level, if known (optional)</label><input id="ctq-base" name="baseline" />
                <button type="submit">Add</button>
              </form></details>)}
        </section>)}

      {tab === "questions" && (
        <section id="questions">
          <p className="muted small">What the AI consultant could not answer from the interviews. A manager sends each question to the right leader; the answer goes to review.</p>
          {(curator ? open : mine).length === 0 && <p className="muted">No open questions{curator ? "" : " for you"}.</p>}
          {(curator ? open : mine).map((q) => (
            <div key={q.id} className="card" data-testid="open-question">
              <div className="small muted">{SECTION_LABEL[q.section]}{q.assigned_to && ` · asked to ${names.get(q.assigned_to) ?? "a member"}`}</div>
              <p style={{ margin: "4px 0 8px" }}><strong>{q.question}</strong></p>
              {(q.assigned_to === membership.id || canManage) && (
                <form action={answerQuestion.bind(null, companyId, q.id)}>
                  <textarea name="answer" rows={2} required minLength={3} aria-label="Answer" placeholder="Your answer" />
                  <button type="submit" className="secondary">Send answer</button>
                </form>)}
              {canManage && (
                <form action={assignQuestion.bind(null, companyId, q.id)} className="row" style={{ gap: 6, flexWrap: "wrap", marginTop: 6 }}>
                  <select name="member" aria-label="Ask" defaultValue={q.assigned_to ?? ""}><option value="">Ask…</option>
                    {members.filter((m) => m.status === "active").map((m) => <option key={m.id} value={m.id}>{m.name}{leaderIds.has(m.id) ? " (leader)" : ""}</option>)}</select>
                  <button type="submit" className="secondary">Send</button>
                  <button type="submit" name="dismiss" value="1" className="secondary">Not needed</button>
                </form>)}
            </div>))}
        </section>)}

      {tab === "leadership" && curator && (
        <section id="leadership">
          <p className="muted small">The first step of the engagement: a structured interview with the Board, MD and senior management (20 questions over the company areas
            and the four voices). Each leader answers in their own time; the AI consultant then proposes the blueprint from their answers and what employees say.</p>
          {(leaders ?? []).length > 0 && (
            <div className="table-wrap"><table className="wrap small" data-testid="leaders-table"><thead><tr><th>Leader</th><th>Interview</th></tr></thead>
              <tbody>{leaders!.map((l) => <tr key={l.id}><td>{names.get(l.respondent_membership_id) ?? "A member"}</td><td>{l.status.replace(/_/g, " ")}</td></tr>)}</tbody></table></div>)}
          {canManage && (
            <form action={startLeadership.bind(null, companyId)} className="card" data-testid="start-leadership">
              <strong>Invite leaders</strong>
              <div className="small muted">Choose the Board members, MD and senior managers who should describe the company. Each needs a department set in Admin.</div>
              <div style={{ columns: 2, marginTop: 8 }}>{members.filter((m) => m.status === "active" && !leaderIds.has(m.id)).map((m) => (
                <label key={m.id} className="small" style={{ display: "block" }}><input type="checkbox" name="members" value={m.id} /> {m.name}</label>))}</div>
              <button type="submit" style={{ marginTop: 8 }}>Invite to the leadership interview</button>
            </form>)}
        </section>)}
    </>
  );
}
