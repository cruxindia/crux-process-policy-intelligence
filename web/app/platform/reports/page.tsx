import Link from "next/link";
import { requirePlatformAdmin } from "@/lib/session";
import { PLATFORM_MIS } from "@/lib/mis";

/** Platform MIS (super admin): clients, money, operations — figures only. */
export default async function PlatformReports() {
  await requirePlatformAdmin();
  const groups = [...new Set(PLATFORM_MIS.map((m) => m.group))];
  return (
    <>
      <h1>Platform reports</h1>
      <p className="muted">Download any report for Excel. Client conversations and documents are never part of these reports.</p>
      <div className="grid2" data-testid="platform-mis-list">{groups.map((g) => (
        <section className="card" key={g}><h2 style={{ marginTop: 0 }}>{g}</h2>
          {PLATFORM_MIS.filter((m) => m.group === g).map((m) => (
            <p key={m.code} style={{ margin: "8px 0" }}><Link href={`/platform/reports/${m.code}`}><strong>{m.title}</strong></Link><br /><span className="small muted">{m.why}</span></p>))}
        </section>))}
      </div>
    </>
  );
}
