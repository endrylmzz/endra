import { describe, expect, it, vi } from "vitest";
import type OpenAI from "openai";
import { createWebSearchTool } from "./web-search.js";

describe("createWebSearchTool", () => {
  it("is a read tool that never requires confirmation", () => {
    const tool = createWebSearchTool({} as OpenAI);
    expect(tool.riskLevel).toBe("read");
    expect(tool.requiresConfirmation).toBe(false);
  });

  it("uses OpenAI's hosted web_search tool and returns the answer text", async () => {
    const create = vi.fn().mockResolvedValue({ output_text: "Bugün hava güneşli. (kaynak.com)" });
    const client = { responses: { create } } as unknown as OpenAI;
    const tool = createWebSearchTool(client);

    const result = await tool.execute(
      { query: "bugün hava nasıl" },
      { userId: "u", conversationId: "c" },
    );

    expect(result).toEqual({ success: true, data: { answer: "Bugün hava güneşli. (kaynak.com)" } });
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        tools: [{ type: "web_search" }],
        input: "bugün hava nasıl",
      }),
    );
  });

  it("returns a failure result when there is no answer text", async () => {
    const client = {
      responses: { create: vi.fn().mockResolvedValue({ output_text: "" }) },
    } as unknown as OpenAI;
    const tool = createWebSearchTool(client);

    const result = await tool.execute({ query: "x" }, { userId: "u", conversationId: "c" });

    expect(result.success).toBe(false);
  });
});
