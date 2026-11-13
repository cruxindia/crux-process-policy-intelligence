// The published Company Operating Blueprint rendered as one source for the expert board (PPI-032). No imports: shipped with board-ai.
const clip = (s: unknown, n: number) => { const t = String(s ?? "").replace(/\s+/g, " ").trim(); return t.length > n ? t.slice(0, n) + " …" : t; };
const ORDER = ["identity", "purpose", "business_model", "services", "customers", "customer_expectations", "footprint", "organisation", "people_authority",
  "technology", "partners", "objectives", "challenges", "risk_appetite", "legal_environment", "future_direction", "voc", "vob", "voe", "vor"];
const LABEL: Record<string, string> = { identity: "Company identity", purpose: "Purpose", business_model: "Business model", services: "Services",
  customers: "Customers", customer_expectations: "Customer expectations", footprint: "Operating footprint", organisation: "Organisation",
  people_authority: "Decision rights", technology: "Technology", partners: "Vendors and partners", objectives: "Business objectives",
  challenges: "Current challenges", risk_appetite: "Risk appetite", legal_environment: "Legal environment", future_direction: "Future direction",
  voc: "Voice of the customer", vob: "Voice of the business", voe: "Voice of the employee", vor: "Voice of the regulator and risk" };

/** The published blueprint as one source for the expert board (agreed by management; CTQ targets approved by a second person). */
export function blueprintSourceText(version: number, content: { sections?: Record<string, string[]>; ctqs?: { code: string; name: string; measure: string;
  unit: string | null; target_value: number | null; target_text: string | null }[] }) {
  const secs = ORDER.filter((s) => content.sections?.[s]?.length).map((s) => `${LABEL[s]}: ${content.sections![s]!.map((t) => clip(t, 300)).join("; ")}`);
  const ctqs = (content.ctqs ?? []).map((c) => `${c.code} ${c.name} — measure: ${clip(c.measure, 200)}${c.unit ? ` (${c.unit})` : ""}; approved target: ${[c.target_value, c.target_text].filter((x) => x !== null && x !== "").join(" ") || "none"}`);
  return `COMPANY OPERATING BLUEPRINT version ${version} (agreed by management). ${secs.join(". ")}.${ctqs.length ? ` Approved CTQs: ${ctqs.join(". ")}.` : ""}`;
}
