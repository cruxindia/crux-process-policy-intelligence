import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePlatformAdmin } from "@/lib/session";
import { InvoiceView, type Invoice } from "@/components/invoice-view";
import { invoiceAction } from "../../actions";

export default async function PlatformInvoice({ params, searchParams }: { params: Promise<{ invoiceId: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { invoiceId } = await params;
  const sp = await searchParams;
  const { supabase } = await requirePlatformAdmin();
  const { data: inv } = await supabase.from("invoices").select("*").eq("id", invoiceId).maybeSingle();
  if (!inv) notFound();
  const act = invoiceAction.bind(null, invoiceId);
  return (
    <>
      <p className="no-print"><Link href="/platform/billing">← Billing</Link></p>
      {sp.e && <div className="notice error no-print">{sp.e}</div>}
      {sp.ok && <div className="notice ok no-print">{sp.ok}</div>}
      <div className="card row no-print" data-testid="invoice-actions">
        {inv.status === "draft" && <>
          <form action={act}><input type="hidden" name="action" value="issue" /><button type="submit">Issue invoice</button></form>
          <form action={act}><input type="hidden" name="action" value="refresh" /><button type="submit" className="secondary">Recalculate</button></form></>}
        {inv.status === "issued" && <form action={act}><input type="hidden" name="action" value="paid" /><button type="submit">Mark as paid</button></form>}
        {inv.disputed && <form action={act}><input type="hidden" name="action" value="dispute_settled" /><button type="submit" className="secondary">Dispute settled</button></form>}
        {inv.status !== "void" && inv.status !== "paid" && (
          <form action={act} className="row" style={{ flexWrap: "nowrap" }}><input type="hidden" name="action" value="void" />
            <input name="note" placeholder="Reason" aria-label="Reason for voiding" style={{ width: 200 }} />
            <button type="submit" className="secondary">{inv.status === "draft" ? "Delete draft" : "Void"}</button></form>)}
      </div>
      <InvoiceView inv={inv as Invoice} />
    </>
  );
}
