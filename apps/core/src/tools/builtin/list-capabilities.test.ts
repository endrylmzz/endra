import { describe, expect, it } from "vitest";
import { ToolRegistry } from "../registry.js";
import { createListCapabilitiesTool } from "./list-capabilities.js";
import type { EndraTool } from "@endra/agent-contracts";

function fakeTool(name: string, description: string): EndraTool {
  return {
    name,
    description,
    category: "test",
    riskLevel: "read",
    requiresConfirmation: false,
    inputSchema: {},
    execute: async () => ({ success: true }),
  };
}

describe("createListCapabilitiesTool", () => {
  it("is a read tool that never requires confirmation", () => {
    const tool = createListCapabilitiesTool(new ToolRegistry());
    expect(tool.riskLevel).toBe("read");
    expect(tool.requiresConfirmation).toBe(false);
  });

  it("lists every registered tool's name and description", async () => {
    const registry = new ToolRegistry();
    registry.register(fakeTool("get_current_time", "Returns the current time."));
    registry.register(fakeTool("get_weather", "Gets the current weather for a city."));
    const tool = createListCapabilitiesTool(registry);

    const result = await tool.execute({}, { userId: "u", conversationId: "c" });

    expect(result).toEqual({
      success: true,
      data: [
        { name: "get_current_time", description: "Returns the current time." },
        { name: "get_weather", description: "Gets the current weather for a city." },
      ],
    });
  });
});
