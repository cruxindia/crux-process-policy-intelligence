// doc-api — Supabase Edge Function (Deno). Read-only document API + website embed (PPI-041, D-096). verify_jwt = false:
// the function does its own authentication with company API keys (hashed in the database; never logged).
//   GET /doc-api/v1/documents                       list released documents          (header  Authorization: Bearer ppi_…  or  x-api-key)
//   GET /doc-api/v1/documents/{slug}?format=html     one document (markdown; html too when asked)
//   GET /doc-api/v1/embed/{COMPANY_CODE}/{slug}      public documents released for website embedding (iframe page, no key)
import { createClient } from "npm:@supabase/supabase-js@2.118.0";
import { embedPage, markdownToHtml } from "../_shared/md-html.ts";

function secretKey() {
  try { const o = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? ""); const k = o.default ?? Object.values(o)[0]; if (typeof k === "string" && k) return k; } catch { /* unset */ }
  return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
}
const CORS = { "access-control-allow-origin": "*", "access-control-allow-headers": "authorization, x-api-key, content-type", "access-control-allow-methods": "GET, OPTIONS" };
const json = (b: unknown, s = 200, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(b), { status: s, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...CORS, ...extra } });
const log = (d: Record<string, unknown>) => console.log(JSON.stringify({ fn: "doc-api", ...d }));

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "GET") return json({ error: "GET only" }, 405);
  const url = new URL(req.url);
  const path = url.pathname.replace(/^.*?\/doc-api/, "").replace(/\/+$/, "");
  const svc = createClient(Deno.env.get("SUPABASE_URL")!, secretKey(), { auth: { persistSession: false } });

  const embed = /^\/v1\/embed\/([A-Za-z0-9_-]{2,40})\/([a-z0-9-]{2,63})$/.exec(path);
  if (embed) {
    const { data, error } = await svc.rpc("doc_api", { p_key: null, p_company_code: embed[1], p_slug: embed[2] });
    const r = data as { status: number; document?: { title: string; body_markdown: string; version: number; approved_at: string } } | null;
    log({ route: "embed", status: error ? 500 : r?.status });
    if (error || !r || r.status !== 200 || !r.document) {
      return new Response(error ? "Temporarily unavailable" : r?.status === 429 ? "Too many requests" : "Not found",
        { status: error ? 500 : r?.status ?? 404, headers: { "content-type": "text/plain; charset=utf-8", ...CORS } });
    }
    const d = r.document;
    const meta = `Version ${d.version}${d.approved_at ? ` · approved ${new Date(d.approved_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" })}` : ""}`;
    return new Response(embedPage(d.title, markdownToHtml(d.body_markdown), meta), { status: 200, headers: {
      "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=300",
      "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors *; base-uri 'none'; form-action 'none'",
      "x-content-type-options": "nosniff", "referrer-policy": "no-referrer" } });
  }

  const m = /^\/v1\/documents(?:\/([a-z0-9-]{2,63}))?$/.exec(path);
  if (!m) return json({ error: "Not found. Use /v1/documents, /v1/documents/{slug} or /v1/embed/{company}/{slug}." }, 404);
  const key = (req.headers.get("x-api-key") ?? req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "").trim();
  if (!/^ppi_[0-9a-f]{48}$/.test(key)) return json({ error: "Send your API key in the x-api-key header (or Authorization: Bearer)." }, 401);
  const { data, error } = await svc.rpc("doc_api", { p_key: key, p_company_code: null, p_slug: m[1] ?? null });
  const r = data as { status: number; error?: string; retry_after?: number; documents?: unknown; document?: { body_markdown: string } } | null;
  log({ route: m[1] ? "get" : "list", status: error ? 500 : r?.status });
  if (error || !r) return json({ error: "Temporarily unavailable" }, 500);
  if (r.status !== 200) return json({ error: r.error }, r.status, r.retry_after ? { "retry-after": String(r.retry_after) } : {});
  if (r.document && url.searchParams.get("format") === "html") return json({ document: { ...r.document, body_html: markdownToHtml(r.document.body_markdown) } });
  return json(r.document ? { document: r.document } : { documents: r.documents });
});
