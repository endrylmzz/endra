import { describe, expect, it } from "vitest";
import { getCurrentTimeTool } from "./get-current-time.js";

describe("getCurrentTimeTool", () => {
  it("is a read tool that never requires confirmation", () => {
    expect(getCurrentTimeTool.riskLevel).toBe("read");
    expect(getCurrentTimeTool.requiresConfirmation).toBe(false);
  });

  it("returns the current time as an ISO 8601 string", async () => {
    const before = Date.now();
    const result = await getCurrentTimeTool.execute({}, { userId: "u1", conversationId: "c1" });
    const after = Date.now();

    expect(result.success).toBe(true);
    const timestamp = new Date(result.data as string).getTime();
    expect(timestamp).toBeGreaterThanOrEqual(before);
    expect(timestamp).toBeLessThanOrEqual(after);
  });
});
