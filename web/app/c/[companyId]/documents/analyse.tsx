"use client";
// Runs the analysis one document at a time while this page is open (no server cost when nobody is waiting);
// stops by itself when the queue is empty or when no approved AI is available.
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type R = { ok: boolean; done?: { id: string; file_name: string; error?: string } | null; remaining?: number; waiting?: string; message?: string; error?: { message: string } };
async function call(companyId: string): Promise<R> {
  const { data, error } = await createClient().functions.invoke("doc-ai", { body: { action: "next", company_id: companyId } });
  if (!error) return data as R;
  try { return (await (error as { context?: Response }).context?.json()) as R; } catch { return { ok: false, error: { message: "Could not reach the analysis service." } }; }
}

export function Analyse({ companyId, queued }: { companyId: string; queued: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false); const [done, setDone] = useState<string[]>([]); const [msg, setMsg] = useState<string | null>(null); const [left, setLeft] = useState(queued);
  const stop = useRef(false);
  return (
    <div className="row" style={{ gap: 10, alignItems: "center" }} data-testid="analyse">
      <button type="button" disabled={busy || left === 0} onClick={async () => {
        setBusy(true); setMsg(null); stop.current = false; let n = 0;
        for (;;) {
          const r = await call(companyId);
          if (!r.ok) { setMsg(r.error?.message ?? "The analysis stopped."); break; }
          if (typeof r.remaining === "number") setLeft(r.remaining);
          if (r.done) { n++; setDone((d) => [r.done!.file_name, ...d].slice(0, 8)); }
          if (r.waiting || !r.done) { if (r.message) setMsg(r.message); break; }
          if (stop.current) break;
          if (n % 5 === 0) router.refresh();
        }
        setBusy(false); router.refresh();
      }}>{busy ? `Analysing… ${left} left` : left ? `Analyse ${left} rule document${left === 1 ? "" : "s"}` : "All rule documents analysed"}</button>
      {busy && <button type="button" className="secondary" onClick={() => { stop.current = true; }}>Pause</button>}
      {msg && <span className="small notice" style={{ margin: 0 }} data-testid="analyse-msg">{msg}</span>}
      {done.length > 0 && <span className="small muted">Last: {done[0]}</span>}
    </div>
  );
}
