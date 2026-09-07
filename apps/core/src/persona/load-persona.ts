// Loads ENDRA's persona (system prompt) from config/persona/, kept as data
// outside the codebase so it can be edited without touching Core's code
// (see CLAUDE.md section 15 - no persona prompts hardcoded inline).
//
// Falls back to a minimal embedded persona if the config file isn't
// present at runtime (e.g. a deployment that only ships apps/core), so
// Core never crashes just because the persona file is missing.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_PERSONA_PATH = path.join(__dirname, "../../../../config/persona/endra.md");

const FALLBACK_PERSONA = "Sen ENDRA'sın, Ender'in dijital alter ego'su. Türkçe, doğal ve öz konuş.";

export function loadPersona(): string {
  const personaPath = process.env.ENDRA_PERSONA_PATH ?? DEFAULT_PERSONA_PATH;
  try {
    const content = readFileSync(personaPath, "utf8").trim();
    return content.length > 0 ? content : FALLBACK_PERSONA;
  } catch {
    return FALLBACK_PERSONA;
  }
}
