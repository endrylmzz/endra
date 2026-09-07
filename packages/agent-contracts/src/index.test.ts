import { describe, expect, it } from "vitest";
import { ENDRA_CHANNELS } from "./index.js";

describe("@endra/agent-contracts", () => {
  it("exports the known channel list", () => {
    expect(ENDRA_CHANNELS).toContain("api");
    expect(ENDRA_CHANNELS).toContain("telegram");
  });
});
