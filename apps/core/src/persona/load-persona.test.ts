import { describe, expect, it } from "vitest";
import { loadPersona } from "./load-persona.js";

describe("loadPersona", () => {
  it("loads the real persona config file", () => {
    const persona = loadPersona();

    expect(persona).toContain("ENDRA");
    expect(persona.length).toBeGreaterThan(50);
  });

  it("falls back to the embedded persona if the config path doesn't exist", () => {
    const previous = process.env.ENDRA_PERSONA_PATH;
    process.env.ENDRA_PERSONA_PATH = "/does/not/exist.md";

    const persona = loadPersona();
    expect(persona).toContain("ENDRA");

    if (previous === undefined) delete process.env.ENDRA_PERSONA_PATH;
    else process.env.ENDRA_PERSONA_PATH = previous;
  });
});
