import Link from "next/link";
import { notFound } from "next/navigation";
import { requireMembership } from "@/lib/session";
import { PROFILE_FIELDS } from "@/lib/company-profile";
import { Uploader } from "../documents/uploader";
import { Analyse } from "../documents/analyse";
import { adoptChecklist, createDepartments, saveProfile, startInterviews } from "./actions";
import { PeopleImport } from "./people-import";

type S = Record<string, number | boolean>;
type DeptRow = { code: string; name: string; department_id: string | null; rule_documents: number; open_findings: number; stakeholders: unknown[] };

/** Set-up guide (owner request 26-Nov-2026): one page that takes a new company from nothing to running interviews.
 *  1 details · 2 checklist · 3 documents (folder, zip, Google Drive; thousands of files) · 4 analysis · 5 people · 6 departments & reviewers · 7 interviews. */
export default async function Setup({ params, searchParams }: { params: Promise<{ companyId: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { companyId } = await params; const sp = await searchParams;
  const { supabase, permissions } = await requireMembership(companyId);
  if (!permissions.has("org.manage")) notFound();
  const [{ data: sum }, { data: co }, { data: versions }, { data: depts }] = await Promise.all([
    supabase.rpc("setup_summary", { p_company: companyId }),
    supabase.from("companies").select("name, profile").eq("id", companyId).single(),
    supabase.from("baseline_versions").select("id, title, version").eq("status", "active").order("activated_at", { ascending: false }),
    supabase.rpc("doc_departments", { p_company: companyId }),
  ]);
  const s = (sum ?? {}) as S; const n = (k: string) => Number(s[k] ?? 0);
  const profile = (co?.profile ?? {}) as Record<string, string>;
  const rows = (depts ?? []) as DeptRow[];
  const steps = [
    { id: "details", done: n("profile_fields") >= 5 },
    { id: "checklist", done: !!s.checklist_adopted },
    { id: "documents", done: n("files") > 0 },
    { id: "analysis", done: n("governing") > 0 && n("to_analyse") === 0 },
    { id: "people", done: n("members_active") + n("members_invited") > 1 },
    { id: "reviewers", done: n("departments_found") > 0 && n("departments_without_reviewer") === 0 },
    { id: "interviews", done: n("interviews_started") > 0 },
  ];
  const doneCount = steps.filter((x) => x.done).length;
  const mark = (id: string) => (steps.find((x) => x.id === id)?.done ? <span className="badge ok">Done</span> : <span className="badge part">To do</span>);

  return (
    <>
      <h1>Set up {co?.name}</h1>
      <p className="muted" style={{ maxWidth: 780 }}>Work down the steps. The platform builds the as-is picture from the company&rsquo;s own documents first — processes, flowcharts, gaps,
        loose ends and risks with suggested fixes — then each department&rsquo;s reviewer confirms it and is interviewed starting from those findings.</p>
      <div className="progress" aria-label="set-up progress" style={{ maxWidth: 520 }}><span style={{ width: `${Math.round((doneCount / steps.length) * 100)}%` }} /></div>
      <p className="small" data-testid="setup-progress">{doneCount} of {steps.length} steps done</p>
      {sp.e && <div className="notice error">{sp.e}</div>}
      {sp.ok && <div className="notice ok">{sp.ok}</div>}

      <section className="card" id="details" data-testid="step-details">
        <h2 style={{ marginTop: 0 }}>1. Company details {mark("details")}</h2>
        <form action={saveProfile.bind(null, companyId)}>
          <div className="grid2">
            {PROFILE_FIELDS.map(([k, label, hint]) => (
              <div key={k}><label htmlFor={`p-${k}`}>{label}</label>
                {k === "registered_address" || k === "notes" || k === "services" || k === "regulators"
                  ? <textarea id={`p-${k}`} name={k} rows={2} defaultValue={profile[k] ?? ""} placeholder={hint} />
                  : <input id={`p-${k}`} name={k} defaultValue={profile[k] ?? ""} placeholder={hint} />}</div>))}
          </div>
          <button type="submit" style={{ marginTop: 10 }}>Save details</button>
        </form>
      </section>

      <section className="card" id="checklist" data-testid="step-checklist">
        <h2 style={{ marginTop: 0 }}>2. Completeness checklist {mark("checklist")}</h2>
        {s.checklist_adopted
          ? <p>{n("checklist_documents")} documents the company should have are on its checklist{n("checklist_missing") ? ` — ${n("checklist_missing")} confirmed missing so far` : ""}. <Link href={`/c/${companyId}/documents#checklist`}>Open the checklist</Link></p>
          : (versions ?? []).length === 0 ? <p className="muted">No checklist is published yet (Platform → Audit checklist).</p>
          : (versions ?? []).map((v) => (
            <form key={v.id} action={adoptChecklist.bind(null, companyId, v.id)} className="row" style={{ gap: 10 }}>
              <span>{v.title} v{v.version}</span><button type="submit">Use this checklist</button></form>))}
      </section>

      <section id="documents" data-testid="step-documents">
        <h2>3. Documents {mark("documents")}</h2>
        <p className="small">{n("files")} files in so far · {n("governing")} rule documents · {n("records")} records · {n("sensitive")} personal/legal (never read) · {n("unreadable")} could not be read.
          {" "}Folders of thousands of files are fine — the upload works in groups of 50 and you can stop and continue; files already in are recognised and skipped.</p>
        <Uploader companyId={companyId} driveClientId={process.env.GOOGLE_DRIVE_CLIENT_ID || undefined} />
      </section>

      <section className="card" id="analysis" data-testid="step-analysis">
        <h2 style={{ marginTop: 0 }}>4. Analysis {mark("analysis")}</h2>
        <p className="small">{n("analysed")} of {n("governing")} rule documents analysed · {n("processes_documented")} processes drawn · {n("findings_open")} open points (gaps, loose ends, risks, questions, missing documents).</p>
        <Analyse companyId={companyId} queued={n("to_analyse")} />
        {n("waiting_provider") > 0 && <p className="notice small">{n("waiting_provider")} documents are waiting for an approved AI — <Link href={`/c/${companyId}/admin/ai`}>approve one under AI connections → Data approvals</Link>.</p>}
        <p className="small" style={{ marginBottom: 0 }}><Link href={`/c/${companyId}/documents/findings`}>See all findings</Link></p>
      </section>

      <section className="card" id="people" data-testid="step-people">
        <h2 style={{ marginTop: 0 }}>5. People {mark("people")}</h2>
        <p className="small">{n("members_active")} active · {n("members_invited")} invited. Add the people who will review and be interviewed (you can also add them one by one under each department below).</p>
        <PeopleImport companyId={companyId} />
      </section>

      <section className="card" id="reviewers" data-testid="step-reviewers">
        <h2 style={{ marginTop: 0 }}>6. Departments &amp; reviewers {mark("reviewers")}</h2>
        {rows.length === 0 ? <p className="muted">Departments appear here once documents are in.</p> : <>
          <p className="small">{n("departments_found")} departments found in the documents · {n("departments_without_reviewer")} still need a reviewer. A reviewer sees their department&rsquo;s as-is processes,
            flowcharts, missing items, loose ends, risks and suggested fixes, and answers each one.</p>
          <div style={{ overflowX: "auto" }}><table className="small"><thead><tr><th>Department</th><th className="num">Rule documents</th><th className="num">Open points</th><th>Reviewers</th></tr></thead><tbody>
            {rows.map((d) => <tr key={d.code}><td>{d.name}</td><td className="num">{d.rule_documents}</td><td className="num">{d.open_findings}</td>
              <td>{d.stakeholders.length ? d.stakeholders.length : <span className="badge warn">none yet</span>}</td></tr>)}
          </tbody></table></div>
          <div className="row" style={{ gap: 10, marginTop: 10 }}>
            {rows.some((d) => !d.department_id) && <form action={createDepartments.bind(null, companyId)}><button type="submit" className="secondary">Create these departments</button></form>}
            <Link className="button" href={`/c/${companyId}/documents#stakeholders`}>Name the reviewers</Link>
          </div></>}
      </section>

      <section className="card" id="interviews" data-testid="step-interviews">
        <h2 style={{ marginTop: 0 }}>7. Interviews {mark("interviews")}</h2>
        <p className="small">{n("reviewers")} reviewers named · {n("interviews_started")} interviews started · {n("interviews_submitted")} finished. Each reviewer&rsquo;s AI interview starts from what the documents
          say about their department and the open points found in them.</p>
        <form action={startInterviews.bind(null, companyId)}><button type="submit" disabled={n("reviewers") === 0}>Start the reviewers&rsquo; interviews</button></form>
        <p className="small" style={{ marginBottom: 0 }}><Link href={`/c/${companyId}/discovery`}>Interview set-up and progress</Link></p>
      </section>
    </>
  );
}
