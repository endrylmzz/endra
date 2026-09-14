import { describe, expect, it, vi } from "vitest";
import type OpenAI from "openai";
import { createGenerateImageTool } from "./generate-image.js";

describe("createGenerateImageTool", () => {
  it("is a write tool that does not require confirmation", () => {
    const tool = createGenerateImageTool({} as OpenAI);
    expect(tool.riskLevel).toBe("write");
    expect(tool.requiresConfirmation).toBe(false);
  });

  it("returns the generated image as an attachment", async () => {
    const generate = vi.fn().mockResolvedValue({ data: [{ b64_json: "ZmFrZS1pbWFnZQ==" }] });
    const client = { images: { generate } } as unknown as OpenAI;
    const tool = createGenerateImageTool(client);

    const result = await tool.execute(
      { prompt: "bir kedi çiz" },
      { userId: "u1", conversationId: "c1" },
    );

    expect(result).toEqual({
      success: true,
      data: { type: "image", data: "ZmFrZS1pbWFnZQ==", mimeType: "image/png" },
    });
    expect(generate).toHaveBeenCalledWith(
      expect.objectContaining({ prompt: "bir kedi çiz", size: "1024x1024" }),
    );
  });

  it("returns a failure result when no image is returned", async () => {
    const client = {
      images: { generate: vi.fn().mockResolvedValue({ data: [] }) },
    } as unknown as OpenAI;
    const tool = createGenerateImageTool(client);

    const result = await tool.execute({ prompt: "x" }, { userId: "u1", conversationId: "c1" });

    expect(result.success).toBe(false);
  });
});
