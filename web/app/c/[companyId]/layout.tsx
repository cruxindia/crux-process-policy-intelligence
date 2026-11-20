import { requireMembership } from "@/lib/session";
import { CompanyNav, type NavItem } from "@/components/company-nav";

/** Company shell: one navigation bar for everything a person may use in this company (permission-aware). */
export default async function CompanyLayout({ children, params }: { children: React.ReactNode; params: Promise<{ companyId: string }> }) {
  const { companyId } = await params;
  const { supabase, membership, permissions: p } = await requireMembership(companyId);
  const [{ count: tickets }, { count: requests }] = await Promise.all([
    supabase.from("tickets").select("id", { count: "exact", head: true }).eq("company_id", companyId).eq("assignee_membership_id", membership.id)
      .in("status", ["open", "in_progress", "waiting"]),
    supabase.from("clarification_tasks").select("id", { count: "exact", head: true }).eq("company_id", companyId).eq("assignee_membership_id", membership.id)
      .in("status", ["open", "assigned", "escalated"]),
  ]);
  const base = `/c/${companyId}`;
  const has = (...x: string[]) => x.some((k) => p.has(k));
  const items: NavItem[] = [
    { href: base, label: "Home" },
    { href: `${base}/tasks`, label: "My work", count: (tickets ?? 0) + (requests ?? 0) },
    ...(has("dashboard.read") ? [{ href: `${base}/dashboard`, label: "Dashboard" }] : []),
    ...(has("interview.review") ? [{ href: `${base}/review`, label: "Review" }] : []),
    ...(has("interview.manage") ? [{ href: `${base}/discovery`, label: "Discovery" }] : []),
    { href: `${base}/catalogue`, label: "Processes" },
    { href: `${base}/blueprint`, label: "Blueprint" },
    ...(has("document.draft", "document.read", "interview.review", "process.edit", "org.manage") ? [{ href: `${base}/board`, label: "Expert board" }] : []),
    { href: `${base}/requests`, label: "Requests" },
    { href: `${base}/projects`, label: "Projects" },
    ...(has("report.read") ? [{ href: `${base}/reports`, label: "Reports" }] : []),
    ...(has("org.manage") ? [{ href: `${base}/integrations`, label: "Websites & apps" }, { href: `${base}/billing`, label: "Billing" }] : []),
    ...(has("org.manage", "membership.manage", "role.manage", "process.edit") ? [{ href: `${base}/admin`, label: "Admin" }] : []),
  ];
  return (
    <>
      <CompanyNav company={membership.companies?.name ?? "Company"} items={items} />
      {children}
    </>
  );
}
