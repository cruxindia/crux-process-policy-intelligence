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
    { href: `${base}/catalogue`, label: "Processes" },
    ...(has("document.draft", "document.read", "interview.review", "process.edit", "org.manage") ? [{ href: `${base}/board`, label: "Expert board" }] : []),
    ...(has("interview.review") ? [{ href: `${base}/review`, label: "Review answers", more: true, hint: "Check and confirm what people said" }] : []),
    ...(has("interview.manage") ? [{ href: `${base}/discovery`, label: "Discovery setup", more: true, hint: "Who is interviewed, and how" }] : []),
    { href: `${base}/blueprint`, label: "Company blueprint", more: true, hint: "Vision, goals and what matters to customers" },
    { href: `${base}/requests`, label: "Questions & disputes", more: true, hint: "Ask a colleague; raise a disagreement" },
    { href: `${base}/projects`, label: "Projects", more: true, hint: "Milestones and progress of each project" },
    ...(has("report.read") ? [{ href: `${base}/reports`, label: "Reports (MIS)", more: true, hint: "Download any report for Excel" }] : []),
    ...(has("org.manage") ? [{ href: `${base}/integrations`, label: "Websites & apps", more: true, hint: "Publish documents to your site and apps" },
                              { href: `${base}/billing`, label: "Billing", more: true, hint: "Package, usage and invoices" }] : []),
    ...(has("org.manage", "membership.manage", "role.manage", "process.edit") ? [{ href: `${base}/admin`, label: "Administration", more: true, hint: "People, roles and AI connections" }] : []),
  ];
  return (
    <>
      <CompanyNav company={membership.companies?.name ?? "Company"} items={items} />
      {children}
    </>
  );
}
