// Provenance hash of the discovery prompt (must match prompt_versions where prompt_key = 'interview.discovery').
import { PROMPT_KEY_V2, PROMPT_VERSION_V2, SYSTEM_PROMPT_V2, TURN_SCHEMA_V2, sha256Hex } from "../supabase/functions/_shared/discovery.ts";
console.log(JSON.stringify({ prompt_key: PROMPT_KEY_V2, version: PROMPT_VERSION_V2, template_sha256: await sha256Hex(SYSTEM_PROMPT_V2 + JSON.stringify(TURN_SCHEMA_V2)) }));
