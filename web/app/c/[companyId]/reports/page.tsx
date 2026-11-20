import Link from "next/link";
import { notFound } from "next/navigation";
import { requireMembership } from "@/lib/session";
import { COMPANY_MIS } from "@/lib/mis";

/** MIS catalogue: every report this person may run, grouped, each with a one-line reason to use it. */
export default async function Reports({ params }: { params: Promise<{ companyId: string }> }) {
  const { companyId } = await params;
  const { permissions } = await requireMembership(companyId);
  if (!permissions.has("report.read")) notFound();
  const admin = permissions.has("org.manage");
  const list = COMPANY_MIS.filter((m) => !m.adminOnly || admin);
  const groups = [...new Set(list.map((m) => m.group))];
  return (
    <>
      <h1>MIS reports</h1>
      <p className="muted">Pick a report, choose the period, and download it for Excel. Department heads see their own departments; company-wide reports are marked.</p>
      <div className="grid2" data-testid="mis-list">
        {groups.map((g) => (
          <section className="card" key={g}>
            <h2 style={{ marginTop: 0 }}>{g}</h2>
            {list.filter((m) => m.group === g).map((m) => (
              <p key={m.code} style={{ margin: "8px 0" }}><Link href={`/c/${companyId}/reports/${m.code}`}><strong>{m.title}</strong></Link>
                {m.companyWide && <span className="badge" style={{ marginLeft: 6 }}>company-wide</span>}<br /><span className="small muted">{m.why}</span></p>))}
          </section>))}
      </div>
    </>
  );
}
