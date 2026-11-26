// Google Drive import (browser only). Signs in with Google in the browser (read-only Drive access, token kept in memory for
// this page), lists a folder and all its sub-folders, and hands each file to the same intake as a local folder.
// Files go from Google straight to this browser; nothing is stored on our servers except what the intake already sends
// (text of rule documents, names and fingerprints of everything else).
import type { Entry } from "./extract";

const sha256Hex = async (b: ArrayBuffer) => [...new Uint8Array(await crypto.subtle.digest("SHA-256", b))].map((x) => x.toString(16).padStart(2, "0")).join("");

export const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.readonly";
const API = "https://www.googleapis.com/drive/v3";
const FOLDER = "application/vnd.google-apps.folder";
/** Google's own formats are exported to Office formats the intake can read. */
const EXPORT: Record<string, [mime: string, ext: string]> = {
  "application/vnd.google-apps.document": ["application/vnd.openxmlformats-officedocument.wordprocessingml.document", "docx"],
  "application/vnd.google-apps.spreadsheet": ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "xlsx"],
  "application/vnd.google-apps.presentation": ["application/vnd.openxmlformats-officedocument.presentationml.presentation", "pptx"],
};

export type DriveFile = { id: string; name: string; mimeType: string; size?: string; modifiedTime?: string; md5Checksum?: string; shortcutDetails?: { targetId: string; targetMimeType: string } };

/** Folder id from a Drive link (…/folders/ID, ?id=ID) or a bare id. */
export function folderIdFromLink(s: string): string | null {
  const t = s.trim();
  const m = /\/folders\/([A-Za-z0-9_-]{10,})/.exec(t) ?? /[?&]id=([A-Za-z0-9_-]{10,})/.exec(t);
  if (m) return m[1]!;
  return /^[A-Za-z0-9_-]{10,}$/.test(t) ? t : null;
}

/** File name as it will appear in the intake (Google formats get the exported extension). */
export function intakeName(f: Pick<DriveFile, "name" | "mimeType">) {
  const ex = EXPORT[f.mimeType];
  return ex && !f.name.toLowerCase().endsWith(`.${ex[1]}`) ? `${f.name}.${ex[1]}` : f.name;
}

/** Google-only formats that cannot be exported to a readable file (forms, sites, maps, drawings…). */
export const unsupportedGoogleType = (mime: string) => mime.startsWith("application/vnd.google-apps.") && mime !== FOLDER && !EXPORT[mime];

async function get(token: string, url: string): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    const r = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
    if (r.ok) return r;
    if ((r.status === 429 || r.status >= 500 || r.status === 403) && attempt < 4) {   // 403 here is usually "rate limit exceeded"
      const body = r.status === 403 ? await r.clone().text() : "";
      if (r.status !== 403 || /rate|quota|limit/i.test(body)) { await new Promise((ok) => setTimeout(ok, 800 * 2 ** attempt)); continue; }
    }
    const msg = await r.text().catch(() => "");
    if (r.status === 403 && /has not been used|is disabled|accessNotConfigured/i.test(msg)) throw new Error("The Google Drive API is not switched on for the Google Cloud project — enable \"Google Drive API\" under APIs & Services, wait a minute and try again");
    throw new Error(r.status === 404 ? "Folder not found — check the link, and that this Google account can open it"
      : r.status === 401 ? "Google sign-in expired — connect again" : `Google Drive error ${r.status}${msg ? `: ${msg.slice(0, 160)}` : ""}`);
  }
}

/** Everything under a folder (all sub-folders), as intake entries. Shortcuts are followed once; Google-only formats are listed as skipped. */
export async function listDriveFolder(token: string, rootId: string, onCount?: (files: number, folders: number) => void):
  Promise<{ root: string; entries: Entry[]; skipped: string[] }> {
  const meta = (await (await get(token, `${API}/files/${rootId}?fields=id,name,mimeType&supportsAllDrives=true`)).json()) as DriveFile;
  if (meta.mimeType !== FOLDER) throw new Error("That link is a file, not a folder — share the folder link");
  const entries: Entry[] = []; const skipped: string[] = [];
  const queue: { id: string; path: string }[] = [{ id: rootId, path: meta.name }];
  const seen = new Set<string>([rootId]); let folders = 0;
  while (queue.length) {
    const { id, path } = queue.shift()!; folders++;
    let pageToken = "";
    do {
      const q = encodeURIComponent(`'${id}' in parents and trashed = false`);
      const url = `${API}/files?q=${q}&pageSize=1000&supportsAllDrives=true&includeItemsFromAllDrives=true`
        + `&fields=nextPageToken,files(id,name,mimeType,size,modifiedTime,md5Checksum,shortcutDetails)${pageToken ? `&pageToken=${pageToken}` : ""}`;
      const page = (await (await get(token, url)).json()) as { nextPageToken?: string; files: DriveFile[] };
      for (const raw of page.files) {
        const f = raw.mimeType === "application/vnd.google-apps.shortcut" && raw.shortcutDetails
          ? { ...raw, id: raw.shortcutDetails.targetId, mimeType: raw.shortcutDetails.targetMimeType } : raw;
        if (f.mimeType === FOLDER) { if (!seen.has(f.id)) { seen.add(f.id); queue.push({ id: f.id, path: `${path}/${f.name}` }); } continue; }
        if (unsupportedGoogleType(f.mimeType)) { skipped.push(`${path}/${f.name}: Google ${f.mimeType.split(".").pop()} — cannot be exported, skipped`); continue; }
        entries.push(toEntry(token, f, path));
      }
      onCount?.(entries.length, folders);
      pageToken = page.nextPageToken ?? "";
    } while (pageToken);
  }
  return { root: meta.name, entries, skipped };
}

function toEntry(token: string, f: DriveFile, folder: string): Entry {
  const ex = EXPORT[f.mimeType];
  return {
    name: intakeName(f), folder, size: Number(f.size ?? 0), modified: f.modifiedTime ? Date.parse(f.modifiedTime) : null,
    bytes: async () => (await get(token, ex ? `${API}/files/${f.id}/export?mimeType=${encodeURIComponent(ex[0])}` : `${API}/files/${f.id}?alt=media&supportsAllDrives=true`)).arrayBuffer(),
    // Files that are only counted (records, personal files) are not downloaded: Drive's own checksum is the fingerprint,
    // so a re-import of the same folder is recognised as "already in".
    fingerprint: f.md5Checksum ? () => sha256Hex(new TextEncoder().encode(`drive-md5:${f.md5Checksum}`).buffer as ArrayBuffer)
      : () => sha256Hex(new TextEncoder().encode(`drive:${f.id}:${f.modifiedTime ?? ""}`).buffer as ArrayBuffer),
  };
}

const GOOGLE_ERR: Record<string, string> = {
  popup_failed_to_open: "Your browser blocked the Google sign-in window — allow pop-ups for this site and try again",
  popup_closed: "The Google sign-in window was closed before finishing",
  access_denied: "Google access was not allowed. If you chose your account and still see this, add your Google account as a test user on the app's OAuth consent screen (Google Cloud → APIs & Services → OAuth consent screen)",
  invalid_client: "Google does not recognise this site's sign-in ID — check GOOGLE_DRIVE_CLIENT_ID on Render",
  idpiframe_initialization_failed: "Google sign-in is not allowed from this address — add https://crux-ppi.onrender.com under Authorized JavaScript origins of the OAuth client",
};

type TokenClient = { requestAccessToken: (o?: { prompt?: string }) => void };
type GoogleOauth = { initTokenClient: (c: { client_id: string; scope: string; callback: (r: { access_token?: string; error?: string }) => void; error_callback?: (e: { type?: string }) => void }) => TokenClient };

/** Google sign-in in the browser (Google Identity Services). Resolves with a short-lived access token. */
export async function connectDrive(clientId: string): Promise<string> {
  const w = window as unknown as { google?: { accounts?: { oauth2?: GoogleOauth } } };
  if (!w.google?.accounts?.oauth2) {
    await new Promise<void>((ok, bad) => {
      const s = document.createElement("script"); s.src = "https://accounts.google.com/gsi/client"; s.async = true;
      s.onload = () => ok(); s.onerror = () => bad(new Error("Could not load Google sign-in")); document.head.appendChild(s);
    });
  }
  return new Promise((ok, bad) => {
    const client = w.google!.accounts!.oauth2!.initTokenClient({ client_id: clientId, scope: DRIVE_SCOPE,
      callback: (r) => (r.access_token ? ok(r.access_token) : bad(new Error(GOOGLE_ERR[r.error ?? ""] ?? `Google refused the sign-in (${r.error ?? "no reason given"})`))),
      error_callback: (e) => bad(new Error(GOOGLE_ERR[e.type ?? ""] ?? `Google sign-in failed (${e.type ?? "unknown"})`)) });
    client.requestAccessToken({ prompt: "" });
  });
}
