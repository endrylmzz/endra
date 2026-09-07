import { describe, expect, it } from "vitest";
import { ENDRA_VERSION } from "./index.js";

describe("@endra/shared", () => {
  it("exports a version string", () => {
    expect(ENDRA_VERSION).toBe("0.1.0");
  });
});
