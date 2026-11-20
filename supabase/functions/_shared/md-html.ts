// Minimal, safe Markdown → HTML for the document API / embed (same subset as web/lib/md.tsx).
// Every piece of text is HTML-escaped; no raw HTML, no links, no images, no attributes from the source — nothing executable.
export const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

function inline(s: string): string {
  let out = ""; let i = 0; const re = /(\*\*[^*]+\*\*|\*[^*\s][^*]*\*|`[^`]+`)/g; let m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    out += esc(s.slice(i, m.index)); const t = m[0];
    out += t.startsWith("**") ? `<strong>${esc(t.slice(2, -2))}</strong>` : t.startsWith("`") ? `<code>${esc(t.slice(1, -1))}</code>` : `<em>${esc(t.slice(1, -1))}</em>`;
    i = m.index + t.length;
  }
  return out + esc(s.slice(i));
}
const cells = (row: string) => row.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());

export function markdownToHtml(text: string): string {
  const lines = text.replace(/\r\n/g, "\n").split("\n"); const out: string[] = []; let i = 0;
  while (i < lines.length) {
    const l = lines[i]!;
    if (!l.trim()) { i++; continue; }
    const h = /^(#{1,6})\s+(.*)$/.exec(l);
    if (h) { const n = Math.min(h[1]!.length + 1, 6); out.push(`<h${n}>${inline(h[2]!)}</h${n}>`); i++; continue; }
    if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(l)) { out.push("<hr>"); i++; continue; }
    if (/^\s*\|/.test(l) && i + 1 < lines.length && /^\s*\|?\s*:?-{2,}/.test(lines[i + 1]!)) {
      const head = cells(l); const rows: string[][] = []; i += 2;
      while (i < lines.length && /^\s*\|/.test(lines[i]!)) rows.push(cells(lines[i++]!));
      out.push(`<table><thead><tr>${head.map((c) => `<th>${inline(c)}</th>`).join("")}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join("")}</tr>`).join("")}</tbody></table>`);
      continue;
    }
    if (/^\s*>/.test(l)) {
      const q: string[] = []; while (i < lines.length && /^\s*>/.test(lines[i]!)) q.push(lines[i++]!.replace(/^\s*>\s?/, ""));
      out.push(`<blockquote>${inline(q.join(" "))}</blockquote>`); continue;
    }
    if (/^\s*([-*+]|\d+[.)])\s+/.test(l)) {
      const ordered = /^\s*\d+[.)]/.test(l); const start = ordered ? parseInt(l.trim(), 10) : 1; const items: string[] = [];
      while (i < lines.length && /^\s*([-*+]|\d+[.)])\s+/.test(lines[i]!)) items.push(lines[i++]!.replace(/^\s*([-*+]|\d+[.)])\s+/, ""));
      const tag = ordered ? "ol" : "ul";
      out.push(`<${tag}${ordered && start !== 1 ? ` start="${start}"` : ""}>${items.map((it) => `<li>${inline(it)}</li>`).join("")}</${tag}>`); continue;
    }
    const p: string[] = [];
    while (i < lines.length && lines[i]!.trim() && !/^(#{1,6}\s|\s*\||\s*>|\s*([-*+]|\d+[.)])\s+)/.test(lines[i]!)) p.push(lines[i++]!.trim());
    if (!p.length) { p.push(l.trim()); i++; }
    out.push(`<p>${p.map(inline).join("<br>")}</p>`);
  }
  return out.join("\n");
}

/** A self-contained page for an <iframe>: no scripts, strict CSP set by the caller, readable on phones. */
export function embedPage(title: string, bodyHtml: string, meta: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title><style>
:root{color-scheme:light dark;--fg:#1d2433;--muted:#5b6475;--line:#d9dee7;--bg:#fff}
@media (prefers-color-scheme:dark){:root{--fg:#e6e9ef;--muted:#a3abba;--line:#343b48;--bg:#14181f}}
body{margin:0;padding:16px;font:16px/1.6 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:var(--fg);background:var(--bg)}
main{max-width:820px;margin:0 auto}h1,h2,h3,h4{line-height:1.25}table{border-collapse:collapse;width:100%;display:block;overflow-x:auto}
th,td{border:1px solid var(--line);padding:6px 8px;text-align:left;vertical-align:top}blockquote{margin:0;padding-left:12px;border-left:3px solid var(--line);color:var(--muted)}
code{font-family:ui-monospace,monospace;font-size:.9em}footer{margin-top:24px;font-size:13px;color:var(--muted)}
</style></head><body><main><h1>${esc(title)}</h1>
${bodyHtml}
<footer>${esc(meta)}</footer></main></body></html>`;
}
