"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

export type NavItem = { href: string; label: string; count?: number };

/** Horizontal company navigation (scrolls on phones). Home matches exactly; other items by prefix. */
export function CompanyNav({ company, items }: { company: string; items: NavItem[] }) {
  const path = usePathname();
  // The interview screen is a focused, full-width conversation: keep the bar but make it compact there.
  const focus = /\/interviews\/[^/]+$/.test(path);
  return (
    <nav className={`company-nav${focus ? " compact" : ""}`} aria-label={`${company} navigation`}>
      <span className="company-name" title={company}>{company}</span>
      {items.map((i, k) => {
        const on = k === 0 ? path === i.href : path === i.href || path.startsWith(i.href + "/");
        return (
          <Link key={i.href} href={i.href} className={on ? "on" : undefined} aria-current={on ? "page" : undefined}>
            {i.label}{i.count ? <span className="count" aria-label={`${i.count} open`}>{i.count}</span> : null}
          </Link>
        );
      })}
    </nav>
  );
}
