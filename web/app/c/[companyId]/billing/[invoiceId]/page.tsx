import Link from "next/link";
import { notFound } from "next/navigation";
import { requireMembership } from "@/lib/session";
import { InvoiceView, type Invoice } from "@/components/invoice-view";
import { disputeInvoice } from "../actions";

export default async function CompanyInvoice({ params, searchParams }: { params: Promise<{ companyId: string; invoiceId: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { companyId, invoiceId } = await params;
  const sp = await searchParams;
  const { supabase, permissions } = await requireMembership(companyId);
  if (!permissions.has("org.manage")) notFound();
  const { data: inv } = await supabase.from("invoices").select("*").eq("company_id", companyId).eq("id", invoiceId).maybeSingle();
  if (!inv) notFound();
  return (
    <>
      <p className="no-print"><Link href={`/c/${companyId}/billing`}>← Billing</Link></p>
      {sp.e && <div className="notice error no-print">{sp.e}</div>}
      <InvoiceView inv={inv as Invoice} />
      {!inv.disputed && inv.status !== "void" && (
        <details className="card no-print" data-testid="dispute">
          <summary>Something wrong with this invoice?</summary>
          <form action={disputeInvoice.bind(null, companyId, invoiceId)}>
            <label htmlFor="dr">What is wrong?</label>
            <textarea id="dr" name="reason" required minLength={10} rows={3} placeholder="e.g. We had 80 active people in October, not 120." />
            <button type="submit" style={{ marginTop: 8 }}>Raise a dispute</button>
          </form>
        </details>)}
    </>
  );
}
