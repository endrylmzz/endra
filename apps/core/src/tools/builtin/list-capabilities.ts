import type { EndraTool } from "@endra/agent-contracts";
import type { ToolRegistry } from "../registry.js";

// Discoverability: with ~20 tools now registered, Ender can't be
// expected to remember all of them - let ENDRA answer "neler
// yapabiliyorsun" from the registry itself instead of going stale.
export function createListCapabilitiesTool(registry: ToolRegistry): EndraTool {
  return {
    name: "list_capabilities",
    description:
      "Lists everything ENDRA can currently do - every available tool and what it does. Use this when the user asks what you can do or help them discover a capability.",
    category: "meta",
    riskLevel: "read",
    requiresConfirmation: false,
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    async execute() {
      const tools = registry
        .list()
        .map((tool) => ({ name: tool.name, description: tool.description }));
      return { success: true, data: tools };
    },
  };
}
