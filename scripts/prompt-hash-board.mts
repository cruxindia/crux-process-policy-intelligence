// Provenance hash of the expert-board prompt (must match prompt_versions where prompt_key = 'board.turn').
import { createHash } from "node:crypto";
import { BOARD_PROMPT_KEY, BOARD_PROMPT_VERSION, BOARD_SCHEMA, BOARD_SYSTEM } from "../supabase/functions/_shared/board.ts";
console.log(JSON.stringify({ prompt_key: BOARD_PROMPT_KEY, version: BOARD_PROMPT_VERSION, template_sha256: createHash("sha256").update(BOARD_SYSTEM + JSON.stringify(BOARD_SCHEMA), "utf8").digest("hex") }));
