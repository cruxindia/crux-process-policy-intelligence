// AI connection routing (Master Corrective Prompt v2.0, Parts 6-7). Pure functions; the Edge Function does I/O.
// Rule: a workload may use (1) connections assigned to its department/process/category, then (2) connections with no
// assignment (shared pool), then (3) the server default key. Connections dedicated to OTHER departments are never used.
// No key rotation to dodge limits: a rate-limited connection is put on cooldown until the provider's own retry time.

export type Conn = {
  id: string; name: string; provider: "gemini" | "ollama"; policy_provider: string; model: string; base_url: string | null;
  priority: number; status: string; cooldown_until: string | null; has_key: boolean;
  assignments: { department_id: string | null; process_id: string | null; interview_category: string | null; active: boolean }[];
};
export type Need = { departmentId: string | null; processId: string | null; category: string };

/** Ordered eligible connections for a workload. Skips disabled, keyless (gemini) and cooling-down connections. */
export function rankConnections(conns: Conn[], need: Need, now = new Date()) {
  const scored: { c: Conn; tier: number }[] = [];
  for (const c of conns) {
    if (c.status !== "active") continue;
    if (c.provider === "gemini" && !c.has_key) continue;
    if (c.provider === "ollama" && !c.base_url) continue;
    if (c.cooldown_until && Date.parse(c.cooldown_until) > now.getTime()) continue;
    const act = c.assignments.filter((a) => a.active);
    let tier: number | null = null;
    if (!c.assignments.length) tier = 3; // never assigned = shared pool (an assignment switched off does NOT make it shared)
    for (const a of act) {
      const deptOk = !a.department_id || a.department_id === need.departmentId;
      const procOk = !a.process_id || a.process_id === need.processId;
      const catOk = !a.interview_category || a.interview_category === need.category;
      if (!(deptOk && procOk && catOk)) continue;
      const t = a.process_id ? 0 : a.department_id ? 1 : 2; // most specific first
      tier = tier === null ? t : Math.min(tier, t);
    }
    if (tier !== null) scored.push({ c, tier });
  }
  return scored.sort((x, y) => x.tier - y.tier || x.c.priority - y.c.priority || x.c.name.localeCompare(y.c.name)).map((s) => s.c);
}

/** Next midnight in America/Los_Angeles (Google's daily quota reset), as a UTC Date. */
export function nextPacificMidnight(now = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", hourCycle: "h23",
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" })
    .formatToParts(now).filter((p) => p.type !== "literal").map((p) => [p.type, Number(p.value)]));
  const wallAsUtc = Date.UTC(parts.year!, parts.month! - 1, parts.day!, parts.hour!, parts.minute!, parts.second!);
  const offset = wallAsUtc - Math.floor(now.getTime() / 1000) * 1000; // LA wall clock minus real UTC
  const nextWall = Date.UTC(parts.year!, parts.month! - 1, parts.day! + 1, 0, 0, 0);
  return new Date(nextWall - offset);
}

/** Cooldown from a provider error, or null when the connection should simply be tried again next time. */
export function cooldownFor(errorClass: string, message: string, now = new Date()): Date | null {
  if (errorClass !== "rate_limit") return null;
  if (/daily|tomorrow/i.test(message)) return nextPacificMidnight(now);
  const m = /about (\d+) seconds/.exec(message);
  return new Date(now.getTime() + Math.min(Math.max(m ? Number(m[1]) : 60, 5), 3600) * 1000);
}

/** Health label stored on the connection and shown to administrators. */
export function healthFor(ok: boolean, errorClass?: string, status?: number) {
  if (ok) return "connected";
  if (errorClass === "config" && status === 404) return "model_unavailable";
  if (errorClass === "config") return "not_configured";
  if (errorClass === "auth") return "auth_failed";
  if (errorClass === "rate_limit") return "rate_limited";
  return "provider_error";
}
export const HEALTH_LABEL: Record<string, string> = {
  untested: "Not tested yet", not_configured: "Not configured", configured: "Configuration found (not tested)",
  connected: "Connected and tested", auth_failed: "Authentication failed", model_unavailable: "Model unavailable",
  rate_limited: "Rate limited", provider_error: "Temporary provider error",
};

/** Employee-facing text when the next step has to wait. Never mentions quotas; never claims work is running. */
export function savedMessage(retryAt: Date | null, now = new Date()) {
  const mins = retryAt ? Math.ceil((retryAt.getTime() - now.getTime()) / 60000) : null;
  const when = mins === null ? "a little later" : mins <= 1 ? "in a minute" : mins < 60 ? `in about ${mins} minutes` : "later today or tomorrow";
  return `Your answers are safely saved. The next part of your conversation will be available ${when} — you can leave this page and come back; you will continue exactly where you stopped.`;
}
