// Prints the provenance hash + output schema of the adaptive interview prompt (must match prompt_versions.template_sha256).
// Usage: node --experimental-strip-types scripts/prompt-hash.mts
import { PROMPT_KEY, PROMPT_VERSION, SYSTEM_PROMPT, TURN_SCHEMA, sha256Hex } from "../supabase/functions/_shared/engine.ts";
console.log(JSON.stringify({ prompt_key: PROMPT_KEY, version: PROMPT_VERSION, template_sha256: await sha256Hex(SYSTEM_PROMPT + JSON.stringify(TURN_SCHEMA)) }));
