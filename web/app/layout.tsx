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
  const email = typeof data?.claims?.email === "string" ? data.claims.email : null;

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
