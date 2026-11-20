"use client";
// Keys go from this browser straight to the ai-pool Edge Function (HTTPS), into Supabase Vault. They are never sent back,
// never stored in this page's state after sending, and "Connected and tested" appears only after a real provider round-trip.
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { PROVIDERS } from "@/lib/ai-pool";

type Res = { ok: boolean; results?: { hint?: string; added?: boolean; reason?: string; health?: string; label?: string; latency_ms?: number; models?: string[] }[]; error?: { message: string } };
async function call(body: Record<string, unknown>): Promise<Res> {
  const { data, error } = await createClient().functions.invoke("ai-pool", { body });
  if (!error) return data as Res;
  try { return (await (error as { context?: Response }).context?.json()) as Res; } catch { return { ok: false, error: { message: "Could not reach the AI service." } }; }
}


export function AddKeys() {
  const router = useRouter();
  const [provider, setProvider] = useState("groq"); const [busy, setBusy] = useState(false); const [res, setRes] = useState<Res | null>(null);
  return (
    <form className="card" data-testid="add-keys" onSubmit={async (e) => {
      e.preventDefault(); const f = new FormData(e.currentTarget);
      const keys = String(f.get("keys") ?? "").split(/[\s,;]+/).map((k) => k.trim()).filter(Boolean);
      if (!keys.length) return;
      setBusy(true); setRes(null);
      const r = await call({ action: "add", provider, label: f.get("label"), model: f.get("model"), base_url: f.get("base_url"), keys });
      (e.target as HTMLFormElement).querySelector<HTMLTextAreaElement>("textarea")!.value = "";   // never keep keys in the page
      setRes(r); setBusy(false); router.refresh();
    }}>
      <h2 style={{ marginTop: 0 }}>Add keys in bulk</h2>
      <div className="grid2">
        <div><label htmlFor="ap-provider">Provider</label>
          <select id="ap-provider" value={provider} onChange={(e) => setProvider(e.target.value)}>
            {Object.entries(PROVIDERS).map(([k, p]) => <option key={k} value={k}>{p.label}</option>)}
          </select></div>
        <div><label htmlFor="ap-label">Name for these keys (optional)</label><input id="ap-label" name="label" placeholder={PROVIDERS[provider]!.label} maxLength={60} /></div>
        <div><label htmlFor="ap-model">Model</label><input id="ap-model" name="model" key={provider} defaultValue={PROVIDERS[provider]!.model} required={provider === "openai_compat"} /></div>
        {provider === "openai_compat" && <div><label htmlFor="ap-base">Base URL</label><input id="ap-base" name="base_url" placeholder="https://…/v1" required /></div>}
      </div>
      <p className="small muted" style={{ margin: "6px 0" }}>{PROVIDERS[provider]!.note}</p>
      <label htmlFor="ap-keys">API keys — one per line (up to 50)</label>
      <textarea id="ap-keys" name="keys" rows={4} autoComplete="off" spellCheck={false} placeholder="Paste keys here. They go straight to the encrypted vault and are never shown again." style={{ fontFamily: "var(--mono, monospace)" }} />
      <button type="submit" disabled={busy} style={{ marginTop: 10 }}>{busy ? "Storing and testing…" : "Store and test"}</button>
      {res && (
        <div className="notice" data-testid="add-result" style={{ marginTop: 10 }}>
          {res.ok ? (
            <ul style={{ margin: 0 }}>{(res.results ?? []).map((r, i) => (
              <li key={i}><span className="mono">{r.hint}</span> — {r.added ? <><strong>stored</strong> · {r.label}</> : <span style={{ color: "var(--danger)" }}>not stored: {r.reason}</span>}</li>))}
            </ul>) : <span style={{ color: "var(--danger)" }}>{res.error?.message}</span>}
        </div>)}
    </form>
  );
}

export function TestKey({ id, label = "Test" }: { id?: string; label?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false); const [msg, setMsg] = useState<string | null>(null);
  return (
    <span className="row" style={{ gap: 6, flexWrap: "nowrap" }}>
      <button type="button" className="secondary" disabled={busy} onClick={async () => {
        setBusy(true); setMsg(null);
        const r = await call({ action: "test", ...(id ? { id } : {}) });
        const one = r.results?.[0];
        setMsg(!r.ok ? r.error?.message ?? "Failed" : id ? `${one?.label ?? ""}${one?.latency_ms ? ` · ${one.latency_ms} ms` : ""}` : `${r.results?.filter((x) => x.health === "connected").length ?? 0} of ${r.results?.length ?? 0} connected`);
        setBusy(false); router.refresh();
      }}>{busy ? "Testing…" : label}</button>
      {msg && <span className="small" data-testid="test-msg">{msg}</span>}
    </span>
  );
}
