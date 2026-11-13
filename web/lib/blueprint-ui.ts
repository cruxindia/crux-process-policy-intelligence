// Labels for the Company Operating Blueprint (PPI-032). Order = the order of the blueprint (§4A areas, then the four voices).
export const SECTION_LABEL: Record<string, string> = {
  identity: "Company identity", purpose: "Purpose", business_model: "Business model", services: "Products and services", customers: "Customers",
  customer_expectations: "Customer expectations", footprint: "Operating footprint", organisation: "Organisation", people_authority: "People and decision rights",
  technology: "Technology", partners: "Vendors and partners", objectives: "Business objectives", challenges: "Current challenges", risk_appetite: "Risk appetite",
  legal_environment: "Legal environment", future_direction: "Future direction",
  voc: "Voice of the customer (VOC)", vob: "Voice of the business (VOB)", voe: "Voice of the employee (VOE)", vor: "Voice of the regulator and risk (VOR)",
};
export const SECTIONS = Object.keys(SECTION_LABEL);
export const AREAS = SECTIONS.slice(0, 16);
export const VOICES = SECTIONS.slice(16);
/** Must be agreed before the first publication (mirrors blueprint_publish). */
export const CORE = ["purpose", "business_model", "services", "customers", "objectives"];
export const VOICE_SHORT: Record<string, string> = { voc: "Customer", vob: "Business", voe: "Employee", vor: "Regulator & risk" };
export const DIRECTION_LABEL: Record<string, string> = { higher_better: "Higher is better", lower_better: "Lower is better", range: "Within a range" };
export const CTQ_STATUS: Record<string, string> = {
  proposed: "No target yet", pending_approval: "Target waiting for approval", approved: "Approved", rejected: "Not used", retired: "Retired",
};
export const SOURCE_LABEL: Record<string, string> = { ai_synthesis: "Proposed by the AI consultant", manual: "Written by a manager", leadership_followup: "Answer from leadership" };
