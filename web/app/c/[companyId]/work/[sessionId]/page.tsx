// Review Centre (Master Corrective Prompt v2.0): everything the system built from one discovery conversation —
// professional profile, responsibility charter, process library with live maps, draft SOPs and open clarifications.
// Read access is enforced by RLS (the employee themself, or people allowed to review that session).
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireMembership } from "@/lib/session";
import { fmtDate, memberNames } from "@/lib/names";
import { draftSop } from "@/lib/sop";
import { ProcessMap, type ProcessFlow } from "@/components/process-map";
import { promoteProcess } from "./actions";
import { openImprovementCase } from "../../board/actions";
import { STATUS_LABEL as BOARD_STATUS } from "@/lib/board-ui";

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

export default async function WorkSummary({ params, searchParams }: { params: Promise<{ companyId: string; sessionId: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const { companyId, sessionId } = await params;
  const { supabase, membership, permissions } = await requireMembership(companyId);
  const { data: s } = await supabase.from("interview_sessions")
    .select("id, status, submitted_at, assignment_id, interview_assignments(id, respondent_membership_id, interview_campaigns(name, interview_mode))")
    .eq("company_id", companyId).eq("id", sessionId).maybeSingle();
  if (!s?.interview_assignments) notFound();
  const [{ data: dp }, { data: procs }, { data: clar }, { names }] = await Promise.all([
    supabase.from("discovery_profiles").select("profile, responsibilities, inventory_confirmed, stage, updated_at").eq("company_id", companyId).eq("session_id", sessionId).maybeSingle(),
    supabase.from("discovered_processes").select("id, process_key, name, purpose, involvement, owner_text, importance, frequency, volume, departments, status, completeness, coverage, flow, flow_version, linked_process_id")
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
  // Reviewers with process.edit can move a discovered process into the governed catalogue (PPI-028).
  const canPromote = !mine && permissions.has("process.edit");
  const [{ data: catalogue }, { data: depts }] = canPromote ? await Promise.all([
    supabase.from("processes").select("id, code, name").eq("company_id", companyId).order("code"),
    supabase.from("departments").select("id, code, name").eq("company_id", companyId).eq("status", "active").order("code"),
  ]) : [{ data: [] as { id: string; code: string; name: string }[] }, { data: [] as { id: string; code: string; name: string }[] }];
  const catName = new Map((catalogue ?? []).map((c) => [c.id, `${c.code} · ${c.name}`]));
  // Expert board (PPI-029): reviewers can ask the expert teams to improve a discovered process; earlier cases are listed per process.
  const canExpert = !mine && ["interview.review", "process.edit", "org.manage"].some((x) => permissions.has(x));
  const procIds = (procs ?? []).map((p) => p.id);
  // Consolidation (PPI-031): each description may belong to ONE company catalogue item that collects everyone's descriptions.
  const [{ data: srcLinks }, { data: srcCounts }] = procIds.length ? await Promise.all([
    supabase.from("catalogue_item_sources").select("discovered_process_id, item_id").eq("company_id", companyId).in("discovered_process_id", procIds),
    supabase.rpc("catalogue_source_counts", { p_company: companyId }),
  ]) : [{ data: [] as { discovered_process_id: string; item_id: string }[] }, { data: [] as { item_id: string; contributors: number }[] }];
  const itemIds = [...new Set((srcLinks ?? []).map((l) => l.item_id))];
  const { data: linkedItems } = itemIds.length ? await supabase.from("catalogue_items").select("id, code, title").eq("company_id", companyId).in("id", itemIds)
    : { data: [] as { id: string; code: string; title: string }[] };
  const itemOf = new Map((srcLinks ?? []).map((l) => [l.discovered_process_id, (linkedItems ?? []).find((i) => i.id === l.item_id)]));
  const peopleOn = new Map((srcCounts ?? []).map((c) => [c.item_id, c.contributors]));
  const { data: boardCases } = canExpert && procIds.length
    ? await supabase.from("board_cases").select("id, title, status, source_process_ids, created_at").eq("company_id", companyId).overlaps("source_process_ids", procIds).order("created_at", { ascending: false })
    : { data: [] as { id: string; title: string; status: string; source_process_ids: string[]; created_at: string }[] };

  return (
    <div className="work">
      <p><Link href={mine ? `/c/${companyId}` : `/c/${companyId}/review/${sessionId}`}>← Back</Link></p>
      <h1>{mine ? "What we understood about your work" : `Work summary${profile.name?.value ? ` — ${profile.name.value}` : ""}`}</h1>
      {sp.e && <div className="notice error">{sp.e}</div>}
      {sp.ok && <div className="notice ok">{sp.ok}</div>}
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
            <article key={p.id} className="card proc" id={`p-${p.id}`}>
              <div className="row" style={{ justifyContent: "space-between" }}>
                <h3 style={{ margin: 0 }}>{p.name}</h3>
                <span className={`badge ${p.status === "sufficient" ? "ok" : p.status === "in_discovery" ? "part" : ""}`}>{STATUS[p.status] ?? p.status} · {p.completeness}%</span>
              </div>
              {p.purpose && <p>{p.purpose}</p>}
              {p.linked_process_id ? (
                <p className="small"><span className="badge ok">In process catalogue</span> {catName.get(p.linked_process_id) ?? ""}</p>
              ) : canPromote && (
                <details className="small" data-testid="promote">
                  <summary>Add to the process catalogue</summary>
                  <form action={promoteProcess.bind(null, companyId, sessionId, p.id)} className="row" style={{ gap: 6, flexWrap: "wrap", marginTop: 6 }}>
                    <input name="code" placeholder="New code, e.g. OPS-P12" aria-label="Process code" style={{ maxWidth: 170 }} />
                    <select name="owner_department_id" aria-label="Owner department"><option value="">Owner department…</option>{(depts ?? []).map((d) => <option key={d.id} value={d.id}>{d.code} · {d.name}</option>)}</select>
                    <select name="classification" aria-label="Classification" defaultValue="internal"><option value="internal">Internal</option><option value="confidential">Confidential</option><option value="restricted">Restricted</option><option value="public">Public</option></select>
                    <span className="muted">or link to</span>
                    <select name="existing_process_id" aria-label="Existing process"><option value="">— new process —</option>{(catalogue ?? []).map((c) => <option key={c.id} value={c.id}>{c.code} · {c.name}</option>)}</select>
                    <button type="submit" className="secondary">Save</button>
                  </form>
                  <div className="muted" style={{ marginTop: 4 }}>It enters the catalogue as a <em>candidate</em>; approval follows the normal review route.</div>
                </details>
              )}
              {itemOf.get(p.id) ? (
                <p className="small" data-testid="company-item"><span className="badge ok">Part of a company process</span>{" "}
                  <Link href={`/c/${companyId}/catalogue/${itemOf.get(p.id)!.id}`}>{itemOf.get(p.id)!.code} · {itemOf.get(p.id)!.title}</Link>
                  {" "}<span className="muted">— described by {peopleOn.get(itemOf.get(p.id)!.id) ?? 1} {peopleOn.get(itemOf.get(p.id)!.id) === 1 ? "person" : "people"}; documents and reviews are made there from all descriptions</span></p>
              ) : !mine && (
                <p className="small muted" data-testid="company-item-missing">Not yet matched to a company process — <Link href={`/c/${companyId}/catalogue?tab=inbox`}>match it</Link> so it is combined with everyone else&rsquo;s description.</p>
              )}
              {canExpert && (
                <div className="small row" style={{ gap: 8, flexWrap: "wrap" }} data-testid="expert-improve">
                  {itemOf.get(p.id) ? (
                    <Link href={`/c/${companyId}/catalogue/${itemOf.get(p.id)!.id}`}>Improve the company process (all descriptions) →</Link>
                  ) : (
                    <form action={openImprovementCase.bind(null, companyId, sessionId, p.id, p.name)}>
                      <button type="submit" className="secondary" title="Uses this person's description only">Ask the expert teams to improve this (this description only)</button>
                    </form>)}
                  {(boardCases ?? []).filter((b) => b.source_process_ids.includes(p.id)).map((b) => (
                    <Link key={b.id} href={`/c/${companyId}/board/${b.id}`}>{BOARD_STATUS[b.status] ?? b.status} · {fmtDate(b.created_at)}</Link>
                  ))}
                </div>
              )}
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
