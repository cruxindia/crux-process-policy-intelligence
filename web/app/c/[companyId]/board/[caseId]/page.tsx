import Link from "next/link";
import { notFound } from "next/navigation";
import { requireMembership } from "@/lib/session";
import { fmtDate } from "@/lib/names";
import { DOC_LABEL } from "@/lib/board-ui";
import { decideCase } from "../actions";
import { DecisionButtons } from "./decision-buttons";
import { Boardroom, type CaseRow, type Output, type Role, type Turn } from "./boardroom";

export default async function CasePage({ params, searchParams }: {
  params: Promise<{ companyId: string; caseId: string }>; searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { companyId, caseId } = await params;
  const sp = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(caseId)) notFound();
  const { supabase, permissions } = await requireMembership(companyId);
  const { data: cs } = await supabase.from("board_cases")
    .select("id, kind, doc_type, title, brief, classification, status, next_step, plan, last_error, run_lock_until, revision_rounds, source_process_ids, created_at, decided_at, decision_note")
    .eq("company_id", companyId).eq("id", caseId).maybeSingle();
  if (!cs) notFound();   // RLS: not visible to this person
  const [{ data: roleRows }, { data: teamRows }, { data: turns }, { data: outs }, { data: procs }] = await Promise.all([
    supabase.from("agent_roles").select("code, title, credentials, version, team_id").eq("company_id", companyId).eq("status", "active"),
    supabase.from("agent_teams").select("id, code, name").eq("company_id", companyId),
    supabase.from("board_turns").select("seq, step, role_code, team_code, kind, addressed_to, summary, content, citations, verdict, created_at").eq("case_id", caseId).order("seq"),
    supabase.from("board_outputs").select("version, title, body_md, dissent, audit_verdict, audit_notes, created_at").eq("case_id", caseId).order("version"),
    cs.source_process_ids.length ? supabase.from("discovered_processes").select("id, name, session_id").in("id", cs.source_process_ids)
      : Promise.resolve({ data: [] as { id: string; name: string; session_id: string }[] }),
  ]);
  const team = new Map((teamRows ?? []).map((t) => [t.id, t]));
  const roles: Role[] = (roleRows ?? []).map((r) => ({ code: r.code, title: r.title, credentials: r.credentials, version: r.version,
    team_code: team.get(r.team_id)?.code ?? "?", team_name: team.get(r.team_id)?.name ?? "" }));
  const canDecide = (permissions.has("document.approve") || permissions.has("org.manage")) && cs.status === "awaiting_approval";

  return (
    <div className="board-wide">
      <p className="no-print"><Link href={`/c/${companyId}/board`}>← Expert board</Link></p>
      <h1 className="no-print">{cs.title}</h1>
      <p className="muted no-print">
        {cs.kind === "improvement_review" ? "Process improvement review" : DOC_LABEL[cs.doc_type ?? "other"]} · {cs.classification} · opened {fmtDate(cs.created_at)}
        {!!procs?.length && <> · based on {procs.map((p, i) => <span key={p.id}>{i ? ", " : ""}<Link href={`/c/${companyId}/work/${p.session_id}#p-${p.id}`}>{p.name}</Link></span>)}</>}
      </p>
      {cs.brief && <details className="no-print"><summary className="small">Brief</summary><p style={{ whiteSpace: "pre-wrap" }}>{cs.brief}</p></details>}
      {sp.e && <div className="notice error no-print">{sp.e}</div>}
      {sp.ok && <div className="notice ok no-print">{sp.ok}</div>}
      {cs.decided_at && <div className={`notice ${cs.status === "approved" ? "ok" : "error"} no-print`}>{cs.status === "approved" ? "Approved" : "Rejected"} on {fmtDate(cs.decided_at)}{cs.decision_note ? ` — ${cs.decision_note}` : ""}</div>}

      <Boardroom initialCase={cs as unknown as CaseRow} roles={roles} initialTurns={(turns ?? []) as Turn[]} initialOutputs={(outs ?? []) as Output[]} />

      {canDecide && (
        <form action={decideCase.bind(null, companyId, caseId)} className="card no-print" data-testid="board-decide">
          <h2 style={{ marginTop: 0 }}>Your decision</h2>
          <p className="small muted">Approving records that you accept this draft as the basis for the final document. It does not publish anything.</p>
          <label htmlFor="note">Note (required to reject)</label>
          <textarea id="note" name="note" rows={2} maxLength={2000} />
          <DecisionButtons />
        </form>
      )}
    </div>
  );
}
