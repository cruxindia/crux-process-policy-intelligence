import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { InstallApp } from "@/components/install-app";
import "./globals.css";

export const metadata: Metadata = {
  title: "Process & Policy Intelligence",
  description: "Governed, source-traceable process and policy knowledge",
  applicationName: "CRUX PPI",
  appleWebApp: { capable: true, title: "CRUX PPI", statusBarStyle: "default" },
  icons: { icon: [{ url: "/icons/favicon-32.png", sizes: "32x32" }, { url: "/icons/icon-192.png", sizes: "192x192" }], apple: "/icons/apple-touch-icon.png" },
};
export const viewport: Viewport = { themeColor: "#0f5bd8", width: "device-width", initialScale: 1 };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const rawEmail = typeof data?.claims?.email === "string" ? data.claims.email : null;
  // Mobile-number accounts use an internal login address; show the number instead.
  const m = rawEmail ? /^91(\d{10})@mobile\.crux-ppi\.invalid$/.exec(rawEmail) : null;
  const email = m ? `+91 ${m[1]}` : rawEmail;
  const { data: owner } = email ? await supabase.rpc("am_platform_admin") : { data: false };

  return (
    <html lang="en">
      <body>
        <header className="top">
          <Link href="/" className="brand">Process &amp; Policy Intelligence</Link>
          {!email && <InstallApp />}
          {email && (
            <form action="/auth/signout" method="post" className="row">
              {owner && <Link href="/platform" className="small" data-testid="platform-link">Platform console</Link>}
              <InstallApp />
              <span className="muted small">{email}</span>
              <Link href="/account/password" className="small">Password</Link>
              <button className="secondary" type="submit">Sign out</button>
            </form>
          )}
        </header>
        <main>{children}</main>
      </body>
    </html>
  );
}
