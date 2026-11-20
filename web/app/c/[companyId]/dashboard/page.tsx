import Link from "next/link";
import { notFound } from "next/navigation";
import { requireMembership } from "@/lib/session";
import { memberNames } from "@/lib/names";
import { DashboardView, type Dash } from "@/components/dashboard-view";

/** Company dashboard for administrators and stakeholders (department heads: their departments). */
export default async function CompanyDashboard({ params }: { params: Promise<{ companyId: string }> }) {
  const { companyId } = await params;
  const { supabase, membership, permissions } = await requireMembership(companyId);
  if (!permissions.has("dashboard.read")) notFound();
  const [{ data, error }, { members }] = await Promise.all([supabase.rpc("company_dashboard", { p_company: companyId }), memberNames(supabase, companyId)]);
  if (error || !data) return <div className="notice error">The dashboard could not be loaded. Please refresh.</div>;
  const d = data as unknown as Dash;
  return (
    <>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h1 style={{ margin: 0 }}>{membership.companies?.name ?? "Company"} — dashboard</h1>
        <div className="row">{permissions.has("report.read") && <Link className="button secondary" href={`/c/${companyId}/reports`}>MIS reports</Link>}
          <Link className="button secondary" href={`/c/${companyId}/projects`}>Projects</Link></div>
      </div>
      <DashboardView d={d} names={new Map(members.map((m) => [m.id, m.name]))} base={`/c/${companyId}`} title={d.scope === "departments" ? "Your departments" : undefined} />
    </>
  );
}
