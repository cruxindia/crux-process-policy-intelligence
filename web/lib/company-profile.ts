// Company details captured in the set-up guide (keys mirror public.company_profile_set, PPI-053).
export const PROFILE_FIELDS: [key: string, label: string, hint?: string][] = [
  ["legal_name", "Legal name", "As registered"], ["cin", "CIN"], ["gstin", "GSTIN"], ["pan", "PAN"], ["incorporated_on", "Incorporated on", "e.g. 2005-04-01"],
  ["registered_address", "Registered office address"], ["industry", "Industry"], ["services", "Main services", "e.g. verification, investigation, back-office support"],
  ["website", "Website"], ["headquarters", "Head office city"], ["locations", "Where you operate", "e.g. Pan India — 28 states"],
  ["branches_own", "Own branches (count)"], ["branches_partner", "Partner / franchise branches (count)"], ["employees", "Employees (approx.)"],
  ["financial_year", "Financial year", "e.g. April–March"], ["regulators", "Regulators / key laws", "e.g. RBI outsourcing guidelines, DPDP Act"],
  ["clients", "Main client types", "e.g. banks, NBFCs, insurers"], ["notes", "Anything else the reviewers should know"],
];
