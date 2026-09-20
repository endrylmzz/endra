import { describe, expect, it, vi } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import { AnthropicProvider } from "./anthropic-provider.js";

function fakeClient(create: ReturnType<typeof vi.fn>): Anthropic {
  return { messages: { create } } as unknown as Anthropic;
}

describe("AnthropicProvider", () => {
  it("throws if no API key is available and no client is injected", () => {
    const previous = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;

    expect(() => new AnthropicProvider()).toThrow(/ANTHROPIC_API_KEY/);

    if (previous !== undefined) process.env.ANTHROPIC_API_KEY = previous;
  });

  it("maps a successful response to LLMGenerateResponse", async () => {
    const create = vi.fn().mockResolvedValue({
      content: [{ type: "text", text: "Merhaba Ender." }],
      model: "claude-sonnet-5",
      usage: { input_tokens: 12, output_tokens: 5 },
    });
    const provider = new AnthropicProvider({ client: fakeClient(create) });

    const result = await provider.generate({
      systemPrompt: "You are ENDRA.",
      messages: [{ role: "user", content: "Merhaba" }],
    });

    expect(result).toEqual({
      content: "Merhaba Ender.",
      model: "claude-sonnet-5",
      usage: { inputTokens: 12, outputTokens: 5 },
    });
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        system: "You are ENDRA.",
        messages: [{ role: "user", content: "Merhaba" }],
      }),
    );
  });

  it("returns an empty string when the response has no text block", async () => {
    const create = vi.fn().mockResolvedValue({
      content: [{ type: "tool_use" }],
      model: "claude-sonnet-5",
      usage: { input_tokens: 1, output_tokens: 1 },
    });
    const provider = new AnthropicProvider({ client: fakeClient(create) });

    const result = await provider.generate({ messages: [{ role: "user", content: "hi" }] });

    expect(result.content).toBe("");
  });

  it("uses the default token budget unless the request overrides it", async () => {
    const create = vi.fn().mockResolvedValue({
      content: [{ type: "text", text: "ok" }],
      model: "claude-sonnet-5",
      usage: { input_tokens: 1, output_tokens: 1 },
    });
    const provider = new AnthropicProvider({ client: fakeClient(create) });

    await provider.generate({ messages: [{ role: "user", content: "hi" }], maxTokens: 4096 });

    expect(create).toHaveBeenCalledWith(expect.objectContaining({ max_tokens: 4096 }));
  });
});
