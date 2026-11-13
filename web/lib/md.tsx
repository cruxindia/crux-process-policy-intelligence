// Minimal, safe Markdown → React (no HTML injection: everything is text nodes). Covers what the board writes:
// headings, paragraphs, bullet/numbered lists, pipe tables, block quotes, horizontal rules, **bold**, *italic*, `code`.
import type { ReactNode } from "react";

function inline(s: string, key: string): ReactNode[] {
  const out: ReactNode[] = []; let i = 0; let n = 0;
  const re = /(\*\*[^*]+\*\*|\*[^*\s][^*]*\*|`[^`]+`)/g; let m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    if (m.index > i) out.push(s.slice(i, m.index));
    const t = m[0];
    if (t.startsWith("**")) out.push(<strong key={`${key}-${n++}`}>{t.slice(2, -2)}</strong>);
    else if (t.startsWith("`")) out.push(<code key={`${key}-${n++}`}>{t.slice(1, -1)}</code>);
    else out.push(<em key={`${key}-${n++}`}>{t.slice(1, -1)}</em>);
    i = m.index + t.length;
  }
  if (i < s.length) out.push(s.slice(i));
  return out;
}
const cells = (row: string) => row.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());

export function Markdown({ text }: { text: string }) {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const blocks: ReactNode[] = []; let i = 0; let k = 0;
  while (i < lines.length) {
    const l = lines[i]!;
    if (!l.trim()) { i++; continue; }
    const h = /^(#{1,6})\s+(.*)$/.exec(l);
    if (h) { const lvl = Math.min(h[1]!.length + 1, 6); const H = `h${lvl}` as "h2"; blocks.push(<H key={k++}>{inline(h[2]!, `h${k}`)}</H>); i++; continue; }
    if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(l)) { blocks.push(<hr key={k++} />); i++; continue; }
    if (/^\s*\|/.test(l) && i + 1 < lines.length && /^\s*\|?\s*:?-{2,}/.test(lines[i + 1]!)) {
      const head = cells(l); const rows: string[][] = []; i += 2;
      while (i < lines.length && /^\s*\|/.test(lines[i]!)) rows.push(cells(lines[i++]!));
      blocks.push(<div className="table-wrap" key={k++}><table className="wrap"><thead><tr>{head.map((c, j) => <th key={j}>{inline(c, `th${k}${j}`)}</th>)}</tr></thead>
        <tbody>{rows.map((r, ri) => <tr key={ri}>{r.map((c, j) => <td key={j}>{inline(c, `td${k}${ri}${j}`)}</td>)}</tr>)}</tbody></table></div>);
      continue;
    }
    if (/^\s*>/.test(l)) {
      const q: string[] = []; while (i < lines.length && /^\s*>/.test(lines[i]!)) q.push(lines[i++]!.replace(/^\s*>\s?/, ""));
      blocks.push(<blockquote key={k++}>{inline(q.join(" "), `q${k}`)}</blockquote>); continue;
    }
    if (/^\s*([-*+]|\d+[.)])\s+/.test(l)) {
      const ordered = /^\s*\d+[.)]/.test(l); const start = ordered ? parseInt(l.trim(), 10) : 1; const items: string[] = [];
      while (i < lines.length && /^\s*([-*+]|\d+[.)])\s+/.test(lines[i]!)) items.push(lines[i++]!.replace(/^\s*([-*+]|\d+[.)])\s+/, ""));
      const L = ordered ? "ol" : "ul";
      blocks.push(<L key={k++} {...(ordered && start !== 1 ? { start } : {})}>{items.map((it, j) => <li key={j}>{inline(it, `li${k}${j}`)}</li>)}</L>); continue;
    }
    const p: string[] = [];
    while (i < lines.length && lines[i]!.trim() && !/^(#{1,6}\s|\s*\||\s*>|\s*([-*+]|\d+[.)])\s+)/.test(lines[i]!)) p.push(lines[i++]!.trim());
    if (!p.length) { p.push(l.trim()); i++; }
    // Single line breaks are meaningful in drafted documents (title blocks, addresses, signature lines): keep them.
    blocks.push(<p key={k++}>{p.flatMap((line, j) => [...(j ? [<br key={`br${k}-${j}`} />] : []), ...inline(line, `p${k}-${j}`)])}</p>);
  }
  return <div className="md">{blocks}</div>;
}
