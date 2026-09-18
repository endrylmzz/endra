import { describe, expect, it, vi } from "vitest";
import type OpenAI from "openai";
import { createRunCodeTool } from "./run-code.js";

describe("createRunCodeTool", () => {
  it("is a read tool that never requires confirmation", () => {
    const tool = createRunCodeTool({} as OpenAI);
    expect(tool.riskLevel).toBe("read");
    expect(tool.requiresConfirmation).toBe(false);
  });

  it("uses OpenAI's hosted code_interpreter tool and returns the answer text", async () => {
    const create = vi
      .fn()
      .mockResolvedValue({ output_text: "17 basamaklı asal: 10000000000000061" });
    const client = { responses: { create } } as unknown as OpenAI;
    const tool = createRunCodeTool(client);

    const result = await tool.execute(
      { task: "17 basamaklı bir asal sayı bul" },
      { userId: "u", conversationId: "c" },
    );

    expect(result).toEqual({
      success: true,
      data: { answer: "17 basamaklı asal: 10000000000000061" },
    });
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        tools: [{ type: "code_interpreter", container: { type: "auto" } }],
        input: "17 basamaklı bir asal sayı bul",
      }),
    );
  });

  it("returns a failure result when there is no answer text", async () => {
    const client = {
      responses: { create: vi.fn().mockResolvedValue({ output_text: "" }) },
    } as unknown as OpenAI;
    const tool = createRunCodeTool(client);

    const result = await tool.execute({ task: "x" }, { userId: "u", conversationId: "c" });

    expect(result.success).toBe(false);
  });
});
