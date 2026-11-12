"use client";
// Key storage and connection tests run through the discovery-ai function (server side). The key is sent once over HTTPS,
// stored in Supabase Vault and never shown again; "Connected and tested" appears only after a real provider round-trip.
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Result = { ok: boolean; connected?: boolean; label?: string; model?: string | null; latency_ms?: number; message?: string | null; error?: { message: string } };

async function call(body: Record<string, string>): Promise<Result> {
  const { data, error } = await createClient().functions.invoke("discovery-ai", { body });
  if (!error) return data as Result;
  try { return (await (error as { context?: Response }).context?.json()) as Result; } catch { return { ok: false, error: { message: "Could not reach the AI service." } }; }
}
const text = (r: Result) => r.ok ? `${r.label}${r.model ? ` · ${r.model}` : ""}${r.latency_ms ? ` · ${r.latency_ms} ms` : ""}${r.message ? ` — ${r.message}` : ""}` : r.error?.message ?? "Failed";

export function TestButton({ companyId, connectionId, label = "Test" }: { companyId: string; connectionId?: string; label?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false); const [r, setR] = useState<Result | null>(null);
  return (
    <span className="row" style={{ gap: 6 }}>
      <button type="button" className="secondary" disabled={busy} onClick={async () => {
        setBusy(true); setR(null);
        const res = await call({ action: "test", company_id: companyId, ...(connectionId ? { connection_id: connectionId } : {}) });
        setR(res); setBusy(false); router.refresh();
      }}>{busy ? "Testing…" : label}</button>
      {r && <span className={`small ${r.ok && r.connected ? "" : "muted"}`} data-testid="test-result" style={{ color: r.ok && r.connected ? "var(--ok)" : "var(--danger)" }}>{text(r)}</span>}
    </span>
  );
}

export function KeyForm({ companyId, connectionId, hasKey }: { companyId: string; connectionId: string; hasKey: boolean }) {
  const router = useRouter();
  const [key, setKey] = useState(""); const [busy, setBusy] = useState(false); const [r, setR] = useState<Result | null>(null);
  return (
    <form className="row" style={{ gap: 6 }} onSubmit={async (e) => {
      e.preventDefault(); if (!key.trim()) return;
      setBusy(true); setR(null);
      const res = await call({ action: "save_key", company_id: companyId, connection_id: connectionId, key: key.trim() });
      setKey(""); setR(res); setBusy(false); router.refresh();
    }}>
      <input type="password" autoComplete="off" spellCheck={false} aria-label="API key" placeholder={hasKey ? "Replace stored key…" : "Paste the API key"} value={key}
        onChange={(e) => setKey(e.target.value)} style={{ maxWidth: 260 }} />
      <button type="submit" disabled={busy || !key.trim()}>{busy ? "Saving…" : hasKey ? "Replace key" : "Store key"}</button>
      {r && <span className="small" style={{ color: r.ok && r.connected ? "var(--ok)" : "var(--danger)" }}>{text(r)}</span>}
    </form>
  );
}
