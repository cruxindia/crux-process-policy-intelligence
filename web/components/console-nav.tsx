"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

/** Left navigation of a console; exact match for the root item, prefix match for the others. */
export function ConsoleNav({ head, items }: { head: string; items: { href: string; label: string }[] }) {
  const path = usePathname();
  const root = items[0]?.href;
  return (
    <nav className="console-nav" aria-label={head}>
      <div className="nav-head">{head}</div>
      {items.map((i) => {
        const on = i.href === root ? path === i.href : path === i.href || path.startsWith(i.href + "/");
        return <Link key={i.href} href={i.href} className={on ? "on" : undefined} aria-current={on ? "page" : undefined}>{i.label}</Link>;
      })}
    </nav>
  );
}
