import { redirect } from "next/navigation";
import { requireMembership } from "@/lib/session";

type Area = { code: string; name: string; open: number; decided: number; processes: number };

/** Stakeholder home for document review: one card per department this person reviews. */
export default async function MyReview({ params }: { params: Promise<{ companyId: string }> }) {
  const { companyId } = await params;
  const { supabase } = await requireMembership(companyId);
  const { data } = await supabase.rpc("my_doc_reviews", { p_company: companyId });
  const areas = (data ?? []) as Area[];
  if (areas.length === 1) redirect(`/c/${companyId}/my-review/${areas[0]!.code}`);
  return (
    <>
      <h1>My review</h1>
      <p className="muted" style={{ maxWidth: 760 }}>Your company&apos;s existing documents were read and compared with a complete checklist. Please look at what they say about your area and tell us what is right, what is wrong and what is missing.</p>
      {!areas.length && <p className="muted">Nothing to review yet.</p>}
      <div className="kpis">{areas.map((a) => (
        <a key={a.code} className="kpi" href={`/c/${companyId}/my-review/${a.code}`} style={{ textDecoration: "none" }}>
          <div className="kpi-label">{a.name}</div><div className="kpi-value">{a.open}</div>
          <div className="kpi-sub">open points · {a.decided} answered · {a.processes} processes</div></a>))}</div>
    </>
  );
}
