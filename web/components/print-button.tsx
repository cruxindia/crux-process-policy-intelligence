"use client";
/** Opens the browser's print dialog — "Save as PDF" downloads the invoice. */
export function PrintButton({ label = "Download / print (PDF)" }: { label?: string }) {
  return <button type="button" className="secondary" onClick={() => window.print()}>{label}</button>;
}
