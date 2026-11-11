"use client";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Status =
  | { ok: true; connected: true; provider: string; model: string; latency_ms: number; checked_at: string }
  | { ok: true; connected: false; provider: string; model: string; checked_at: string; error: { class: string; message: string } }
  | { ok: false; error: { class: string; message: string } };

/** Runs a REAL request to the configured AI provider through the server (Edge Function). Never shows "connected" without one. */
export function AiStatus({ companyId }: { companyId: string }) {
  const [s, setS] = useState<Status | null>(null);
  const [busy, setBusy] = useState(false);

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

  return (
    <div className="card row" data-testid="ai-status">
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
  );
}
