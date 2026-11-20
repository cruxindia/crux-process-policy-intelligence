import { requirePlatformAdmin } from "@/lib/session";
import { ConsoleNav } from "@/components/console-nav";

/** Platform console (super admin, D-091): every company's figures, billing, AI pool and tickets — never client content. */
export default async function PlatformLayout({ children }: { children: React.ReactNode }) {
  await requirePlatformAdmin();
  return (
    <div className="wide-page" style={{ margin: "0 auto" }}>
      <div className="console">
        <ConsoleNav head="Platform" items={[
          { href: "/platform", label: "Overview" },
          { href: "/platform/companies", label: "Companies" },
          { href: "/platform/tickets", label: "Tickets" },
          { href: "/platform/billing", label: "Billing" },
        ]} />
        <div style={{ minWidth: 0 }}>{children}</div>
      </div>
    </div>
  );
}
