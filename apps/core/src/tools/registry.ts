// TOOLARCH-002: holds every tool ENDRA can currently use, whether a
// native TypeScript function or a wrapped MCP server tool - both are
// just an EndraTool to the registry.

import type { EndraTool } from "@endra/agent-contracts";

export class ToolRegistry {
  private readonly tools = new Map<string, EndraTool>();

  register(tool: EndraTool): void {
    if (this.tools.has(tool.name)) {
      throw new Error(`Tool "${tool.name}" is already registered`);
    }
    this.tools.set(tool.name, tool);
  }

  get(name: string): EndraTool | undefined {
    return this.tools.get(name);
  }

  list(): EndraTool[] {
    return [...this.tools.values()];
  }
}
