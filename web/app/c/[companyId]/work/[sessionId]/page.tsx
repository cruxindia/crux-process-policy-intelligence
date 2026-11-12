// Review Centre (Master Corrective Prompt v2.0): everything the system built from one discovery conversation —
// professional profile, responsibility charter, process library with live maps, draft SOPs and open clarifications.
// Read access is enforced by RLS (the employee themself, or people allowed to review that session).
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireMembership } from "@/lib/session";
import { fmtDate, memberNames } from "@/lib/names";
import { draftSop } from "@/lib/sop";
import { ProcessMap, type ProcessFlow } from "@/components/process-map";

const PROFILE: [string, string][] = [
  ["name", "Name"], ["designation", "Designation"], ["department", "Department"], ["sub_department", "Team / function"], ["reporting_manager", "Reports to"],
  ["location", "Location"], ["teams_managed", "Teams managed"], ["functions_handled", "Functions handled"], ["accountability_areas", "Accountable for"],
  ["decision_authority", "Decision authority"], ["approvals_given", "Approves"], ["approvals_received", "Needs approval from"], ["other_roles", "Other roles"],
  ["interacting_departments", "Works with"],
];
const KIND: Record<string, string> = { daily: "Daily", weekly: "Weekly", monthly: "Monthly", quarterly: "Quarterly", occasional: "Occasional", exception: "Exceptions",
  for_other_department: "For other departments", informal: "Informal work", should_be_owned_elsewhere: "Should be owned elsewhere", unowned: "Nobody formally owns", automatable: "Could be automated" };
const STATUS: Record<string, string> = { identified: "Identified", in_discovery: "Being discussed", sufficient: "Well understood" };
const DIMS: [string, string][] = [["purpose", "Purpose"], ["trigger", "Trigger"], ["roles", "Roles"], ["activities", "Steps"], ["systems", "Systems"], ["tat", "Turnaround"],
  ["controls", "Controls"], ["exceptions", "Exceptions"], ["dependencies", "Other teams"], ["performance", "Performance"]];

export default async function WorkSummary({ params }: { params: Promise<{ companyId: string; sessionId: string }> }) {
  const { companyId, sessionId } = await params;
  const { supabase, membership } = await requireMembership(companyId);
  const { data: s } = await supabase.from("interview_sessions")
    .select("id, status, submitted_at, assignment_id, interview_assignments(id, respondent_membership_id, interview_campaigns(name, interview_mode))")
    .eq("company_id", companyId).eq("id", sessionId).maybeSingle();
  if (!s?.interview_assignments) notFound();
  const [{ data: dp }, { data: procs }, { data: clar }, { names }] = await Promise.all([
    supabase.from("discovery_profiles").select("profile, responsibilities, inventory_confirmed, stage, updated_at").eq("company_id", companyId).eq("session_id", sessionId).maybeSingle(),
    supabase.from("discovered_processes").select("id, process_key, name, purpose, involvement, owner_text, importance, frequency, volume, departments, status, completeness, coverage, flow, flow_version")
      .eq("company_id", companyId).eq("session_id", sessionId).neq("status", "removed").order("created_at"),
    supabase.from("interview_clarifications").select("id, description, status, created_at").eq("company_id", companyId).eq("session_id", sessionId).order("created_at"),
    memberNames(supabase, companyId),
  ]);
  const mine = s.interview_assignments.respondent_membership_id === membership.id;
  const open = ["in_progress", "reopened"].includes(s.status);
  const profile = { ...((dp?.profile ?? {}) as Record<string, { value?: string; source_ref?: string }>) };
  const signupName = names.get(s.interview_assignments.respondent_membership_id);
  if (!profile.name?.value && signupName) profile.name = { value: signupName, source_ref: "sign-up" };
  const resp = (Array.isArray(dp?.responsibilities) ? dp.responsibilities : []) as { name: string; kind: string; note?: string; source_ref?: string }[];
  const byKind = new Map<string, typeof resp>();
  for (const r of resp) byKind.set(r.kind, [...(byKind.get(r.kind) ?? []), r]);
  const openClar = (clar ?? []).filter((c) => c.status === "open");
  const chat = `/c/${companyId}/interviews/${s.interview_assignments.id}`;

  return (
    <div className="work">
      <p><Link href={mine ? `/c/${companyId}` : `/c/${companyId}/review/${sessionId}`}>← Back</Link></p>
      <h1>{mine ? "What we understood about your work" : `Work summary${profile.name?.value ? ` — ${profile.name.value}` : ""}`}</h1>
      <div className="notice">
        <strong>Draft.</strong> Built automatically from {mine ? "your" : "the"} conversation{dp?.updated_at ? ` (last updated ${fmtDate(dp.updated_at)})` : ""}. Nothing here is
        approved yet — a reviewer checks it before it becomes company knowledge.
        {mine && (open
          ? <> Something wrong or missing? <Link href={chat}>Tell me in the conversation</Link> — e.g. “That&rsquo;s not how it happens: …” — and this page updates.</>
          : <> To correct something now, reply to your reviewer&rsquo;s questions or ask them to reopen your conversation.</>)}
      </div>

      <nav className="toc small"><a href="#profile">Professional profile</a> · <a href="#charter">Responsibility charter</a> · <a href="#library">Process library ({procs?.length ?? 0})</a> · <a href="#clarifications">Clarifications ({openClar.length})</a></nav>

      <section id="profile" className="card">
        <h2>Professional profile</h2>
        <dl className="kv">
          {PROFILE.filter(([k]) => profile[k]?.value).map(([k, l]) => <div key={k}><dt>{l}</dt><dd>{profile[k]!.value}{profile[k]!.source_ref && <span className="muted small"> · from {profile[k]!.source_ref}</span>}</dd></div>)}
        </dl>
        {PROFILE.some(([k]) => !profile[k]?.value) && <p className="muted small">Not discussed yet: {PROFILE.filter(([k]) => !profile[k]?.value).map(([, l]) => l.toLowerCase()).join(", ")}.</p>}
      </section>

      <section id="charter" className="card">
        <h2>Responsibility charter</h2>
        {resp.length === 0 ? <p className="muted">No responsibilities discussed yet.</p> : (
          <div className="grid2">
            {[...byKind.entries()].map(([k, rs]) => (
              <div key={k}><h3 className="small" style={{ margin: "4px 0" }}>{KIND[k] ?? k}</h3>
                <ul className="small" style={{ margin: 0 }}>{rs.map((r) => <li key={r.name}>{r.name}{r.note ? <span className="muted"> — {r.note}</span> : null}</li>)}</ul></div>
            ))}
          </div>
        )}
        <p className="muted small">{dp?.inventory_confirmed ? "✓ Confirmed as the complete list." : "Not yet confirmed as the complete list."}</p>
      </section>

      <section id="library">
        <h2>Process library</h2>
        {!procs?.length && <p className="muted">No activities identified yet.</p>}
        {procs?.map((p) => {
          const flow = (p.flow ?? null) as ProcessFlow | null;
          const sop = draftSop(flow);
          const cov = (p.coverage ?? {}) as Record<string, string>;
          return (
            <article key={p.id} className="card proc" id={`p-${p.process_key}`}>
              <div className="row" style={{ justifyContent: "space-between" }}>
                <h3 style={{ margin: 0 }}>{p.name}</h3>
                <span className={`badge ${p.status === "sufficient" ? "ok" : p.status === "in_discovery" ? "part" : ""}`}>{STATUS[p.status] ?? p.status} · {p.completeness}%</span>
              </div>
              {p.purpose && <p>{p.purpose}</p>}
              <p className="muted small">{[p.frequency && `Frequency: ${p.frequency}`, p.volume && `Volume: ${p.volume}`, p.involvement && `Role: ${p.involvement}`,
                p.owner_text && `Owner: ${p.owner_text}`, p.importance && `Importance: ${p.importance}`, p.departments?.length && `Other departments: ${p.departments.join(", ")}`].filter(Boolean).join(" · ")}</p>
              <div className="dims small">{DIMS.map(([d, l]) => <span key={d} className={`badge ${cov[d] === "sufficient" ? "ok" : cov[d] === "partial" ? "part" : ""}`}>{l}</span>)}</div>
              <div className="grid2" style={{ marginTop: 10, alignItems: "start" }}>
                <div>
                  <h4 className="small">Process map{p.flow_version ? ` · version ${p.flow_version}` : ""}</h4>
                  <ProcessMap flow={flow} height={380} />
                </div>
                <div>
                  <h4 className="small">Draft SOP (steps as described)</h4>
                  {sop.lines.length === 0 ? <p className="muted small">No steps described yet.</p> : (
                    <ol className="sop">{sop.lines.map((l, i) => (
                      <li key={i} className={`sop-${l.kind}`}><span className="sop-n">{l.n}</span> {l.text}
                        {(l.actor || l.system) && <span className="muted small"> — {[l.actor, l.system].filter(Boolean).join(" · ")}</span>}</li>
                    ))}</ol>
                  )}
                  {sop.gaps.length > 0 && <div className="small" style={{ marginTop: 8 }}><strong>Gaps to clarify</strong><ul style={{ margin: "4px 0 0" }}>{sop.gaps.map((g) => <li key={g}>{g}</li>)}</ul></div>}
                </div>
              </div>
            </article>
          );
        })}
      </section>

      <section id="clarifications" className="card">
        <h2>Clarifications</h2>
        {!(clar ?? []).length ? <p className="muted">No conflicting answers found.</p> : (
          <ul>{(clar ?? []).map((c) => <li key={c.id}><span className={`badge ${c.status === "open" ? "warn" : "ok"}`}>{c.status === "open" ? "Open" : "Resolved"}</span> {c.description}</li>)}</ul>
        )}
      </section>
    </div>
  );
}
