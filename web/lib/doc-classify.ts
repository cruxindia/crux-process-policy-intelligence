// First look at every uploaded file, done on the uploader's computer before anything is sent (D-105, D-106).
// governing = rules people follow (policy, SOP, role/KRA, form, template, circular, agreement template) -> text is analysed;
// record    = evidence that work happened (letters, minutes, resolutions, invoices, photos) -> metadata only, never text;
// sensitive = personal or legal-sensitive records (pay, loans, health, discipline, police, court, IDs) -> metadata only, flagged.
// Deterministic and explainable: the reason is shown to the admin, who can change the category.

export type Category = "governing" | "record" | "sensitive";
export type Classification = { category: Category; docType: string; department: string | null; reason: string };

/** Baseline departments (document code prefixes of the audit-readiness master). */
export const DEPARTMENTS: Record<string, string> = {
  GOV: "Board / Corporate Governance / Company Secretariat", BE: "Strategy / Business Excellence / PMO", OPS: "Operations / Service Delivery",
  HR: "Human Resources", FIN: "Finance & Accounts", BD: "Sales / Business Development / Marketing", CS: "Client Success / Customer Service",
  PM: "Partner Management / Channel & Franchise Operations", PROC: "Procurement / Vendor Management / Administration",
  IT: "IT / Information Security / Data", LRC: "Legal / Compliance / Enterprise Risk / Internal Audit",
};

const SENSITIVE: [RegExp, string][] = [
  [/\b(police|f\.?i\.?r|complaint against|court|summons|arbitrat|legal notice|demand notice|notice to|reply to (the )?notice|lawyer|advocate|criminal|cheque bounce|section 138|settlement deed)\b/i, "legal or police matter"],
  [/\b(salary|ctc|payslip|pay slip|increment|appraisal letter|bonus letter|loan|advance (request|letter)|full (and|&) final|f ?& ?f|gratuity)\b/i, "pay or money of a person"],
  [/\b(warning|show[- ]?cause|disciplinary|suspension|termination|terminat|absconding|misconduct|explanation letter)\b/i, "disciplinary record"],
  [/\b(medical|health|hospital|sick|pregnan|maternity)\b/i, "health record"],
  [/\b(aadha+r|pan card|passport|voter id|driving licen[cs]e|bank statement|cancelled cheque|kyc|resume|\bcv\b|bank ?details)\b/i, "identity or bank document"],
  [/\b(resignation|relieving|experience letter)\b/i, "employee exit record"],
];
const GOVERNING: [RegExp, string][] = [
  [/\bpolic(y|ies)\b/i, "policy"], [/\b(sop|s\.o\.p|standard operating)\b/i, "sop"], [/\b(procedures?|process( notes?| flows?| documents?)?|work ?flows?|flow ?charts?|steps for|strategy for|training|programme|program)\b/i, "procedure"],
  [/\b(guidelines?|manuals?|handbooks?|playbooks?|frameworks?|charters?|code of conduct)\b/i, "guideline"], [/\b(kras?|kpis?|k ?r ?a|key result|job descriptions?|\bjd\b|roles? (and|&) responsibilit|approved positions)/i, "role"],
  [/\b(formats?|templates?|checklists?|forms?|matrix|register format|questionnaires?)\b/i, "form"], [/\b(circular|office order|notice to all|sla|service level)\b/i, "circular"],
  [/\b(agreement|contract|nda|mou)\b.*\b(draft|template|format|standard)\b|\b(draft|template|format|standard)\b.*\b(agreement|contract|nda|mou)\b/i, "agreement_template"],
];
const RECORD: [RegExp, string][] = [
  [/\b(appointment|offer letter|confirmation letter|promotion|transfer letter|joining)\b/i, "employee letter"], [/\b(undertaking|declaration|affidavit|indemnity bond)\b/i, "undertaking"],
  [/\b(resolution|minutes|\bmom\b|agenda|board meeting|agm|egm)\b/i, "minutes or resolution"], [/\b(invoice|receipt|quotation|purchase order|\bpo\b|bill|voucher|payment)\b/i, "financial record"],
  [/\b(agreement|contract|nda|mou|empanelment|work order)\b/i, "signed agreement"], [/\b(letter|request|reply|intimation|authori[sz]ation|certificate|noc)\b/i, "letter"],
  [/\b(report|mis|tracker|summary|statement|list)\b/i, "report or list"],
];
const DEPT: [RegExp, string][] = [
  [/\b(board|director|resolution|agm|egm|roc|mca|secretarial|statutory register|shareholder|dir-?\d|mgt-?\d)\b/i, "GOV"],
  [/\b(partner|franchis|business associate|\bba\b|channel)\b/i, "PM"],
  [/\b(field (executive|manager|officer)|verification|investigation|case|tat|branch|operations?|audit(ing)? (of )?(verification )?report|back ?office)\b/i, "OPS"],
  [/\b(hr|human resource|recruit|appointment|employee|leave|attendance|kra|kpi|training|induction|warning|salary|payroll|offer letter|plb|reward|wfh|work from home)\b/i, "HR"],
  [/\b(finance|account|invoice|gst|tds|expense|reimburse|budget|payment|bank|cash|financial approval|petty)\b/i, "FIN"],
  [/\b(legal|agreement|contract|nda|notice|court|arbitrat|compliance|risk|internal audit|police)\b/i, "LRC"],
  [/\b(client|customer|escalation|complaint|feedback|sla)\b/i, "CS"],
  [/\b(sales|business development|\bbd\b|proposal|tender|rfp|empanelment|marketing|brochure)\b/i, "BD"],
  [/\b(vendor|procure|purchase|asset|admin|office|stationery|travel)\b/i, "PROC"],
  [/\b(\bit\b|password|access|laptop|software|data|email|cyber|backup)\b/i, "IT"],
  [/\b(strategy|pmo|project|business excellence|okr|review meeting)\b/i, "BE"],
];
const ABSOLUTE = /\b(aadha+r|pan card|passport|voter id|bank statement|cancelled cheque|kyc\w*|payslip|pay slip|resume|cv|police|fir)\b/i;
const RULE_NAME = /\b(polic(y|ies)|sop|procedures?|guidelines?|manuals?|handbooks?|templates?|formats?|forms?|checklists?|frameworks?)\b/i;
const IMAGE = /\.(jpe?g|png|gif|bmp|heic|webp|tiff?)$/i;
/** Text shaped like a rule document (headings people use in policies/SOPs). */
const RULE_SHAPE = /\b(purpose|objective)\b[\s\S]{0,4000}\b(scope|applicab)\w*[\s\S]{0,6000}\b(responsibilit|procedure|process|policy)\w*/i;

const pathText = (name: string, folder: string) => `${folder.replace(/[\\/]+/g, " / ")} / ${name}`.replace(/[_.-]+/g, " ");

export function classify(fileName: string, folder = "", textStart = ""): Classification {
  const t = pathText(fileName.replace(/\.[^.]+$/, ""), folder);
  const deptOf = (s: string) => DEPT.find(([re]) => re.test(s))?.[1] ?? null;
  const department = deptOf(t) ?? (textStart ? deptOf(textStart.slice(0, 3000)) : null);
  // Identity papers, CVs and police matters are always sensitive; other sensitive words are fine in a rule document's name
  // ("Health and Safety Policy", "Warning letter template"). Mirrors private.sensitive_name on the server.
  const ruleName = RULE_NAME.test(t);
  for (const [re, why] of SENSITIVE) if (re.test(t) && (ABSOLUTE.test(t) || !ruleName)) return { category: "sensitive", docType: why, department, reason: `Name suggests a ${why}` };
  if (IMAGE.test(fileName)) return { category: "record", docType: "photo or scan", department, reason: "Image file (photo or scan)" };
  // Governing words in the file name win over record words ("Leave application form" is a form, "Appointment letter template" a template).
  for (const [re, type] of GOVERNING) if (re.test(t)) return { category: "governing", docType: type, department, reason: `Name suggests a ${type.replace("_", " ")}` };
  for (const [re, type] of RECORD) if (re.test(t)) {
    if (textStart && RULE_SHAPE.test(textStart)) return { category: "governing", docType: "procedure", department, reason: `Named like a ${type} but written like a policy (purpose / scope / responsibilities)` };
    return { category: "record", docType: type, department, reason: `Name suggests a ${type}` };
  }
  if (textStart && RULE_SHAPE.test(textStart)) return { category: "governing", docType: "procedure", department, reason: "Written like a policy (purpose / scope / responsibilities)" };
  return { category: "record", docType: "other", department, reason: "No sign of a rule document; kept as a record" };
}

/** Text may only leave the computer for governing documents, and never with a sensitive-looking name (checked again on the server). */
export const mayShareText = (c: Classification) => c.category === "governing";
