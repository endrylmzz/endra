// ENDRA Core entry point.
// Phase 0 placeholder only - the actual API (POST /api/v1/message, /health,
// LLM provider wiring, memory, tool router) is built starting in Phase 1.

import { ENDRA_VERSION } from "@endra/shared";

export function getCoreVersion(): string {
  return ENDRA_VERSION;
}
