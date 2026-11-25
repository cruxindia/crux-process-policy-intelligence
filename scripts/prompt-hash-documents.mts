// Provenance hash of the document analysis prompt (must match prompt_versions where prompt_key = 'document.analysis').
import { createHash } from "node:crypto";
import { DOC_PROMPT_KEY, DOC_PROMPT_VERSION, DOC_SCHEMA, DOC_SYSTEM } from "../supabase/functions/_shared/doc-analysis.ts";
console.log(JSON.stringify({ prompt_key: DOC_PROMPT_KEY, version: DOC_PROMPT_VERSION, template_sha256: createHash("sha256").update(DOC_SYSTEM + JSON.stringify(DOC_SCHEMA), "utf8").digest("hex") }));
