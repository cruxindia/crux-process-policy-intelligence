"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Status =
  | { ok: true; connected: true; provider: string; model: string; latency_ms: number; checked_at: string }
  | { ok: true; connected: false; provider: string; model: string; checked_at: string; error: { class: string; message: string } }
  | { ok: false; error: { class: string; message: string } };

/**
 * Runs a REAL request to the configured AI provider through the server (Edge Function). Never shows "connected" without one.
 * Administrators can then switch the company's join link between the fixed questions and the AI interview.
 */
export function AiStatus({ companyId, canSwitch, linkMode }: { companyId: string; canSwitch: boolean; linkMode: "adaptive" | "fixed" | "discovery" | null }) {
  const router = useRouter();
  const [s, setS] = useState<Status | null>(null);
  const [busy, setBusy] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [switchMsg, setSwitchMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const connected = !!(s && s.ok && s.connected);

  async function check() {
    setBusy(true); setS(null);
    const { data, error } = await createClient().functions.invoke("interview-ai", { body: { action: "status", company_id: companyId } });
    if (error) {
      let body: Status | null = null;
      try { body = await (error as { context?: Response }).context?.json(); } catch { /* not JSON */ }
      setS(body ?? { ok: false, error: { class: "network", message: "Could not reach the AI service. Check your connection and try again." } });
    } else setS(data as Status);
    setBusy(false);
  }

  async function setMode(adaptive: boolean) {
    setSwitching(true); setSwitchMsg(null);
    const { data, error } = await createClient().rpc("set_join_interview_mode", { p_company: companyId, p_adaptive: adaptive });
    setSwitching(false);
    if (error) { setSwitchMsg({ ok: false, text: error.message.replace(/^PPI_\w+: /, "") }); return; }
    setSwitchMsg({ ok: true, text: adaptive
      ? `Done — new sign-ups on the join link now get the AI interview (${data}). People already interviewed keep their answers.`
      : `Done — the join link is back on the fixed questions (${data}).` });
    router.refresh();
  }

  return (
    <div className="card" data-testid="ai-status">
      <div className="row">
        <div className="grow">
          <strong>AI interviewer</strong>
          {!s && <div className="muted small">Not checked yet. The check sends one tiny test request (no company data) to the AI provider.</div>}
          {s && s.ok && s.connected && (
            <div className="small"><span className="badge ok">Connected</span> {s.provider} · model {s.model} · answered in {s.latency_ms} ms · {new Date(s.checked_at).toLocaleString()}</div>
          )}
          {s && s.ok && !s.connected && (
            <div className="small"><span className="badge warn">Not connected</span> {s.provider} · model {s.model} — {s.error.message} <span className="muted">({s.error.class})</span></div>
          )}
          {s && !s.ok && <div className="small"><span className="badge warn">Check failed</span> {s.error.message}</div>}
        </div>
        <button type="button" className="secondary" disabled={busy} onClick={check}>{busy ? "Checking…" : "Test AI connection"}</button>
      </div>
      {canSwitch && linkMode && (
        <div className="row" style={{ marginTop: 10 }} data-testid="mode-switch">
          <div className="grow small">
            Join link currently starts: <strong>{linkMode === "discovery" ? "the AI-led discovery conversation" : linkMode === "adaptive" ? "the AI interview" : "the fixed questions"}</strong>
            {linkMode === "fixed" && !connected && <span className="muted"> · the AI must show <em>Connected</em> before it can be turned on</span>}
          </div>
          {linkMode === "fixed"
            ? <button type="button" disabled={!connected || switching} onClick={() => setMode(true)}>{switching ? "Switching…" : "Turn on AI interview"}</button>
            : <button type="button" className="secondary" disabled={switching} onClick={() => setMode(false)}>{switching ? "Switching…" : "Switch back to fixed questions"}</button>}
        </div>
      )}
      {switchMsg && <div className={`notice ${switchMsg.ok ? "ok" : "error"}`} style={{ marginTop: 8 }}>{switchMsg.text}</div>}
    </div>
  );
}
