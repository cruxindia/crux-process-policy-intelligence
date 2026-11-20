"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

export type NavItem = { href: string; label: string; count?: number; more?: boolean; hint?: string };

/** Company navigation: the few places people use daily stay visible; everything else sits under "More" with a one-line hint.
 *  Home matches exactly; other items by prefix. Wraps instead of scrolling on phones, so nothing is hidden off-screen. */
export function CompanyNav({ company, items }: { company: string; items: NavItem[] }) {
  const path = usePathname();
  const focus = /\/interviews\/[^/]+$/.test(path);   // the interview is a focused conversation: compact bar
  const isOn = (i: NavItem, k: number) => (k === 0 ? path === i.href : path === i.href || path.startsWith(i.href + "/"));
  const main = items.filter((i) => !i.more);
  const more = items.filter((i) => i.more);
  const activeMore = more.find((i) => isOn(i, 1));
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {   // close "More" on a click outside it or on Escape
    const close = (e: Event) => { const d = ref.current; if (d?.open && (e.type === "keydown" ? (e as KeyboardEvent).key === "Escape" : !d.contains(e.target as Node))) d.open = false; };
    document.addEventListener("pointerdown", close); document.addEventListener("keydown", close);
    return () => { document.removeEventListener("pointerdown", close); document.removeEventListener("keydown", close); };
  }, []);
  return (
    <nav className={`company-nav${focus ? " compact" : ""}`} aria-label={`${company} navigation`}>
      <span className="company-name" title={company}>{company}</span>
      {main.map((i) => {
        const on = isOn(i, items.indexOf(i));
        return (
          <Link key={i.href} href={i.href} className={on ? "on" : undefined} aria-current={on ? "page" : undefined}>
            {i.label}{i.count ? <span className="count" aria-label={`${i.count} open`}>{i.count}</span> : null}
          </Link>
        );
      })}
      {more.length > 0 && (
        <details className="nav-more" key={path} ref={ref} data-testid="nav-more">
          <summary className={activeMore ? "on" : undefined}>{activeMore ? activeMore.label : "More"} ▾</summary>
          <div className="nav-more-menu" role="menu">
            {more.map((i) => (
              <Link key={i.href} href={i.href} role="menuitem" className={isOn(i, 1) ? "on" : undefined}>
                <span>{i.label}{i.count ? <span className="count">{i.count}</span> : null}</span>
                {i.hint && <span className="hint">{i.hint}</span>}
              </Link>))}
          </div>
        </details>)}
    </nav>
  );
}
