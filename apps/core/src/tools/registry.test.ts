import { describe, expect, it } from "vitest";
import type { EndraTool } from "@endra/agent-contracts";
import { ToolRegistry } from "./registry.js";

function fakeTool(name: string): EndraTool {
  return {
    name,
    description: "test tool",
    category: "test",
    riskLevel: "read",
    requiresConfirmation: false,
    inputSchema: {},
    execute: async () => ({ success: true }),
  };
}

describe("ToolRegistry", () => {
  it("registers and retrieves a tool by name", () => {
    const registry = new ToolRegistry();
    const tool = fakeTool("get_current_time");

    registry.register(tool);

    expect(registry.get("get_current_time")).toBe(tool);
  });

  it("returns undefined for an unknown tool", () => {
    expect(new ToolRegistry().get("nope")).toBeUndefined();
  });

  it("lists all registered tools", () => {
    const registry = new ToolRegistry();
    registry.register(fakeTool("a"));
    registry.register(fakeTool("b"));

    expect(
      registry
        .list()
        .map((t) => t.name)
        .sort(),
    ).toEqual(["a", "b"]);
  });

  it("throws when registering a duplicate tool name", () => {
    const registry = new ToolRegistry();
    registry.register(fakeTool("a"));

    expect(() => registry.register(fakeTool("a"))).toThrow(/already registered/);
  });
});
