"use client";
import { useActionState, useState } from "react";
import { createKey, type KeyState } from "./actions";

/** Creates an API key and shows it exactly once, with a copy button. */
export function NewKeyForm({ companyId }: { companyId: string }) {
  const [state, action, pending] = useActionState<KeyState, FormData>(createKey.bind(null, companyId), null);
  const [copied, setCopied] = useState(false);
  return (
    <div>
      <form action={action} className="row" style={{ alignItems: "flex-end" }}>
        <div style={{ flex: 1, minWidth: 200 }}><label htmlFor="k-name">Where will this key be used?</label>
          <input id="k-name" name="name" required minLength={2} maxLength={80} placeholder="e.g. Company website, HR app" /></div>
        <button type="submit" disabled={pending}>{pending ? "Creating…" : "Create API key"}</button>
      </form>
      {state?.error && <div className="notice error">{state.error}</div>}
      {state?.key && (
        <div className="notice ok once" data-testid="new-key">
          <strong>Copy this key now — it will not be shown again.</strong> ({state.name})
          <div className="row" style={{ marginTop: 6 }}>
            <code className="mono" data-testid="key-value" style={{ wordBreak: "break-all", flex: 1 }}>{state.key}</code>
            <button type="button" className="secondary" onClick={async () => { try { await navigator.clipboard.writeText(state.key!); setCopied(true); } catch { setCopied(false); } }}>
              {copied ? "Copied" : "Copy"}</button>
          </div>
          <div className="small muted" style={{ marginTop: 4 }}>Keep it on your server (never in website code). If it leaks, revoke it below and create a new one.</div>
        </div>)}
    </div>
  );
}
