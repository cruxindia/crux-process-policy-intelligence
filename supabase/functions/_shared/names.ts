// Interviewees are referred to by role, never by name (board drafts, blueprint synthesis). Pure functions.
/** Interviewees are referred to by role, never by name: replaces their names (full name and first name) in free text. */
export function redactNames(text: string | null | undefined, names: string[]): string | null {
  if (text == null) return null;
  let t = String(text);
  for (const n of [...names].sort((a, b) => b.length - a.length)) t = t.replace(new RegExp(`\\b${n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "gi"), "the interviewee");
  return t;
}
/** Name tokens to protect: every leading part of each display name ("Neha", "Neha Shah", "Neha Shah K"), 3+ letters. */
export function nameTokens(displayNames: (string | null | undefined)[]): string[] {
  const out = new Set<string>();
  for (const d of displayNames) {
    const w = String(d ?? "").trim().split(/\s+/).filter(Boolean);
    for (let i = 1; i <= w.length; i++) { const t = w.slice(0, i).join(" "); if (t.length >= 3) out.add(t); }
  }
  return [...out];
}
