"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/** Starts the AI consultant's synthesis (runs in the background) and refreshes the page until it finishes. */
export function SynthesisButton({ companyId, running }: { companyId: string; running: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => router.refresh(), 5000);
    return () => clearInterval(t);
  }, [running, router]);
  async function start() {
    setBusy(true); setErr(null);
    const { data, error } = await createClient().functions.invoke("blueprint-ai", { body: { action: "synthesise", company_id: companyId } });
    setBusy(false);
    if (error || data?.ok === false) setErr(data?.error?.message ?? "Could not start the synthesis. Try again in a minute.");
    router.refresh();
  }
  return (
    <div>
      <button type="button" onClick={start} disabled={busy || running} data-testid="run-synthesis">
        {running ? "The AI consultant is working…" : busy ? "Starting…" : "Ask the AI consultant to update the blueprint"}
      </button>
      {err && <div className="notice error small">{err}</div>}
    </div>
  );
}
