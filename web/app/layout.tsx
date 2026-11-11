import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import "./globals.css";

export const metadata: Metadata = {
  title: "Process & Policy Intelligence",
  description: "Governed, source-traceable process and policy knowledge",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const rawEmail = typeof data?.claims?.email === "string" ? data.claims.email : null;
  // Mobile-number accounts use an internal login address; show the number instead.
  const m = rawEmail ? /^91(\d{10})@mobile\.crux-ppi\.invalid$/.exec(rawEmail) : null;
  const email = m ? `+91 ${m[1]}` : rawEmail;

  return (
    <html lang="en">
      <body>
        <header className="top">
          <Link href="/" className="brand">Process &amp; Policy Intelligence</Link>
          {email && (
            <form action="/auth/signout" method="post" className="row">
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
