// Wraps tools exposed by an MCP (Model Context Protocol) server as
// EndraTool instances, so the registry/router don't need to know
// whether a tool is native TypeScript or came from an MCP server.
//
// IMPORTANT: MCP has no concept of risk level or confirmation - it just
// exposes callable tools. Every tool from a new MCP server defaults to
// read/no-confirmation here, which is only safe for a server you've
// actually reviewed (like the official test server used for
// TOOLARCH-007's proof). Before connecting any real-world MCP server
// (Phase 5+), pass explicit `overrides` for any tool that can mutate
// state or cost money - never trust the default for those.

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import type { EndraTool, ToolResult, ToolRiskLevel } from "@endra/agent-contracts";

export interface McpServerConfig {
  command: string;
  args?: string[];
}

export async function connectMcpServer(config: McpServerConfig): Promise<Client> {
  const client = new Client({ name: "endra-core", version: "0.1.0" }, { capabilities: {} });
  const transport = new StdioClientTransport({ command: config.command, args: config.args });
  await client.connect(transport);
  return client;
}

export interface McpToolOverride {
  riskLevel?: ToolRiskLevel;
  requiresConfirmation?: boolean;
}

export async function loadMcpTools(
  client: Client,
  options: { category?: string; overrides?: Record<string, McpToolOverride> } = {},
): Promise<EndraTool[]> {
  const { tools } = await client.listTools();
  return tools.map((tool) =>
    wrapMcpTool(client, tool, options.category ?? "mcp", options.overrides?.[tool.name]),
  );
}

function wrapMcpTool(
  client: Client,
  mcpTool: { name: string; description?: string; inputSchema: Record<string, unknown> },
  category: string,
  override: McpToolOverride = {},
): EndraTool {
  return {
    name: mcpTool.name,
    description: mcpTool.description ?? "",
    category,
    riskLevel: override.riskLevel ?? "read",
    requiresConfirmation: override.requiresConfirmation ?? false,
    inputSchema: mcpTool.inputSchema,
    async execute(input): Promise<ToolResult> {
      try {
        const result = await client.callTool({
          name: mcpTool.name,
          arguments: input as Record<string, unknown>,
        });
        return { success: !result.isError, data: result.content };
      } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : String(err) };
      }
    },
  };
}
