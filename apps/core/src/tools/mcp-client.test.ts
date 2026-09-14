import { describe, expect, it, vi } from "vitest";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { loadMcpTools } from "./mcp-client.js";

function fakeClient(overrides: Partial<Client> = {}): Client {
  return {
    listTools: vi.fn().mockResolvedValue({
      tools: [{ name: "echo", description: "Echoes input", inputSchema: { type: "object" } }],
    }),
    callTool: vi
      .fn()
      .mockResolvedValue({ content: [{ type: "text", text: "hi" }], isError: false }),
    ...overrides,
  } as unknown as Client;
}

describe("loadMcpTools", () => {
  it("wraps each MCP tool as an EndraTool defaulting to read/no-confirmation", async () => {
    const client = fakeClient();

    const tools = await loadMcpTools(client);

    expect(tools).toHaveLength(1);
    expect(tools[0]).toMatchObject({
      name: "echo",
      description: "Echoes input",
      riskLevel: "read",
      requiresConfirmation: false,
      category: "mcp",
    });
  });

  it("applies a per-tool risk override", async () => {
    const client = fakeClient();

    const tools = await loadMcpTools(client, {
      overrides: { echo: { riskLevel: "write", requiresConfirmation: true } },
    });

    expect(tools[0]).toMatchObject({ riskLevel: "write", requiresConfirmation: true });
  });

  it("execute() calls the MCP client's callTool and returns its content on success", async () => {
    const client = fakeClient();
    const [tool] = await loadMcpTools(client);

    const result = await tool.execute({ text: "hi" }, { userId: "u1", conversationId: "c1" });

    expect(client.callTool).toHaveBeenCalledWith({ name: "echo", arguments: { text: "hi" } });
    expect(result).toEqual({ success: true, data: [{ type: "text", text: "hi" }] });
  });

  it("execute() returns a failure result when the MCP server reports isError", async () => {
    const client = fakeClient({
      callTool: vi.fn().mockResolvedValue({ content: [], isError: true }),
    });
    const [tool] = await loadMcpTools(client);

    const result = await tool.execute({}, { userId: "u1", conversationId: "c1" });

    expect(result.success).toBe(false);
  });

  it("execute() returns a failure result instead of throwing when the call itself throws", async () => {
    const client = fakeClient({ callTool: vi.fn().mockRejectedValue(new Error("mcp down")) });
    const [tool] = await loadMcpTools(client);

    const result = await tool.execute({}, { userId: "u1", conversationId: "c1" });

    expect(result).toEqual({ success: false, error: "mcp down" });
  });
});
