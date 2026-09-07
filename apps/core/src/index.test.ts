import { describe, expect, it } from "vitest";
import { getCoreVersion } from "./index.js";

describe("@endra/core", () => {
  it("resolves the workspace version via @endra/shared", () => {
    expect(getCoreVersion()).toBe("0.1.0");
  });
});
