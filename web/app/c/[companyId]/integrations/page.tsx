import { notFound } from "next/navigation";
import { nowMs } from "@/lib/time";
import { requireMembership } from "@/lib/session";
import { supabaseEnv } from "@/lib/env";
import { fmtDate } from "@/lib/names";
import { NewKeyForm } from "./key-form";
import { release, revokeKey, unrelease } from "./actions";

const slugify = (t: string) => t.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "document";
const CLS: Record<string, [string, string]> = { public: ["Public", "ok"], internal: ["Internal", ""], confidential: ["Confidential", "warn"], restricted: ["Restricted", "danger"] };

/** Integrations (PPI-041, D-096): share approved documents with the company's own website and apps. */
export default async function Integrations({ params, searchParams }: { params: Promise<{ companyId: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { companyId } = await params; const sp = await searchParams;
  const { supabase, membership, permissions } = await requireMembership(companyId);
  if (!permissions.has("org.manage")) notFound();
  const code = (membership.companies as { code?: string } | null)?.code ?? "";
  const since = new Date(nowMs() - 30 * 864e5).toISOString();
  const [{ data: keys }, { data: rels }, { data: cases }, { data: calls }] = await Promise.all([
    supabase.from("company_api_keys").select("id, name, key_prefix, created_at, last_used_at, calls_total, revoked_at").eq("company_id", companyId).order("created_at", { ascending: false }),
    supabase.from("document_releases").select("id, case_id, slug, public_embed, released_at, calls_total").eq("company_id", companyId).is("revoked_at", null),
    supabase.from("board_cases").select("id, title, doc_type, classification, decided_at").eq("company_id", companyId).eq("status", "approved").order("decided_at", { ascending: false }),
    supabase.from("document_api_calls").select("endpoint, status").eq("company_id", companyId).gte("at", since).limit(10000),
  ]);
  const relBy = new Map((rels ?? []).map((r) => [r.case_id, r]));
  const base = `${supabaseEnv().url}/functions/v1/doc-api/v1`;
  const ok = (calls ?? []).filter((c) => c.status === 200).length;
  const active = (keys ?? []).filter((k) => !k.revoked_at);
  const sample = (rels ?? [])[0]?.slug ?? "your-document";
  const embedSample = (rels ?? []).find((r) => r.public_embed)?.slug;

  return (
    <>
      <h1>Websites &amp; apps</h1>
      <p className="muted" style={{ maxWidth: 760 }}>Publish approved policies and SOPs straight into your website, intranet or HR app — always the latest approved version, so nobody reads an old copy.
        Only documents you release here are reachable. Confidential and restricted documents can never be released.</p>
      {sp.e && <div className="notice error">{sp.e}</div>}
      {sp.ok && <div className="notice ok">{sp.ok}</div>}

      <div className="kpis" data-testid="int-kpis">
        <div className="kpi"><div className="kpi-label">Documents released</div><div className="kpi-value">{rels?.length ?? 0}</div><div className="kpi-sub">of {cases?.length ?? 0} approved</div></div>
        <div className="kpi"><div className="kpi-label">On your website</div><div className="kpi-value">{(rels ?? []).filter((r) => r.public_embed).length}</div></div>
        <div className="kpi"><div className="kpi-label">Active API keys</div><div className="kpi-value">{active.length}</div></div>
        <div className="kpi"><div className="kpi-label">Reads in 30 days</div><div className="kpi-value">{ok}</div><div className="kpi-sub">{(calls ?? []).length - ok} refused</div></div>
      </div>

      <section className="card" id="docs" data-testid="int-docs">
        <h2 style={{ marginTop: 0 }}>1 · Choose what to share</h2>
        {!cases?.length ? <p className="muted">No approved documents yet. When the expert board&rsquo;s documents are approved, they appear here.</p> : (
          <div className="table-wrap"><table>
            <thead><tr><th>Document</th><th>Class</th><th>Shared as</th><th /></tr></thead>
            <tbody>{cases.map((c) => {
              const r = relBy.get(c.id); const [cl, cc] = CLS[c.classification] ?? [c.classification, ""];
              const blocked = c.classification !== "public" && c.classification !== "internal";
              return (
                <tr key={c.id}>
                  <td style={{ whiteSpace: "normal", minWidth: 200 }}><strong>{c.title}</strong><div className="small muted">{c.doc_type ?? "document"} · approved {fmtDate(c.decided_at)}</div></td>
                  <td><span className={`badge ${cc}`}>{cl}</span></td>
                  <td className="small">{r ? <><span className="mono">{r.slug}</span><div>{r.public_embed ? "Website + API" : "API only"} · {r.calls_total} reads</div></> : blocked ? "Never shared" : "Not shared"}</td>
                  <td>{!blocked && (
                    <details>
                      <summary className="small">{r ? "Change" : "Share"}</summary>
                      <form action={release.bind(null, companyId, c.id)} style={{ minWidth: 240, paddingTop: 6 }}>
                        <label htmlFor={`sl-${c.id}`}>Web name</label>
                        <input id={`sl-${c.id}`} name="slug" defaultValue={r?.slug ?? slugify(c.title)} pattern="[a-z0-9][a-z0-9\-]{1,62}" required />
                        <label className="row small" style={{ gap: 6, marginTop: 6 }}>
                          <input type="checkbox" name="embed" defaultChecked={r?.public_embed} disabled={c.classification !== "public"} style={{ width: "auto" }} />
                          Show on our public website {c.classification !== "public" && "(public documents only)"}</label>
                        <button type="submit" style={{ marginTop: 6 }}>{r ? "Save" : "Share"}</button>
                      </form>
                      {r && <form action={unrelease.bind(null, companyId, r.id)} style={{ marginTop: 6 }}><button type="submit" className="secondary">Stop sharing</button></form>}
                    </details>)}
                  </td>
                </tr>);
            })}</tbody>
          </table></div>)}
      </section>

      <section className="card" id="embed">
        <h2 style={{ marginTop: 0 }}>2 · Put it on your website (no code skills needed)</h2>
        <p className="small muted">Paste this where the document should appear. It always shows the latest approved version, works on phones, and contains no scripts.</p>
        <pre className="code" data-testid="embed-snippet">{`<iframe src="${base}/embed/${code}/${embedSample ?? "your-public-document"}"
  title="Policy" style="width:100%;min-height:600px;border:0" loading="lazy"></iframe>`}</pre>
        {!embedSample && <p className="small muted">Share a <strong>public</strong> document with &ldquo;Show on our public website&rdquo; ticked to get a working link.</p>}
      </section>

      <section className="card" id="keys" data-testid="int-keys">
        <h2 style={{ marginTop: 0 }}>3 · Connect your apps (API)</h2>
        <p className="small muted">For your developers: a read-only API for released public and internal documents. Keys belong on a server — never in website code.</p>
        <NewKeyForm companyId={companyId} />
        {!!keys?.length && (
          <div className="table-wrap" style={{ marginTop: 12 }}><table>
            <thead><tr><th>Key</th><th>Created</th><th>Last used</th><th className="num">Calls</th><th /></tr></thead>
            <tbody>{keys.map((k) => (
              <tr key={k.id} style={k.revoked_at ? { opacity: 0.55 } : undefined}>
                <td><strong>{k.name}</strong><div className="small mono">{k.key_prefix}…</div></td>
                <td className="small">{fmtDate(k.created_at)}</td><td className="small">{fmtDate(k.last_used_at)}</td><td className="num">{k.calls_total}</td>
                <td>{k.revoked_at ? <span className="badge">Revoked {fmtDate(k.revoked_at)}</span> :
                  <form action={revokeKey.bind(null, companyId, k.id)}><button type="submit" className="secondary">Revoke</button></form>}</td>
              </tr>))}</tbody>
          </table></div>)}
        <details style={{ marginTop: 12 }}>
          <summary>Developer quick start</summary>
          <pre className="code">{`# list released documents
curl -H "x-api-key: YOUR_KEY" ${base}/documents

# one document (Markdown; add ?format=html for safe HTML too)
curl -H "x-api-key: YOUR_KEY" "${base}/documents/${sample}?format=html"`}</pre>
          <p className="small muted">Responses are JSON. Limits: 120 requests per minute per key. A document that is withdrawn, re-classified confidential or replaced by a
            newer approved version changes here immediately. Every call is logged (without content).</p>
        </details>
      </section>
    </>
  );
}
