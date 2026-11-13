// Provenance hash of the blueprint synthesis prompt (must match prompt_versions where prompt_key = 'blueprint.synthesis').
import { createHash } from "node:crypto";
import { BLUEPRINT_PROMPT_KEY, BLUEPRINT_PROMPT_VERSION, BLUEPRINT_SCHEMA, BLUEPRINT_SYSTEM } from "../supabase/functions/_shared/blueprint.ts";
console.log(JSON.stringify({ prompt_key: BLUEPRINT_PROMPT_KEY, version: BLUEPRINT_PROMPT_VERSION, template_sha256: createHash("sha256").update(BLUEPRINT_SYSTEM + JSON.stringify(BLUEPRINT_SCHEMA), "utf8").digest("hex") }));
