import { describe, expect, it, vi } from "vitest";
import type OpenAI from "openai";
import { OpenAIProvider } from "./openai-provider.js";

function fakeClient(create: ReturnType<typeof vi.fn>): OpenAI {
  return { chat: { completions: { create } } } as unknown as OpenAI;
}

describe("OpenAIProvider", () => {
  it("throws if no API key is available and no client is injected", () => {
    const previous = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;

    expect(() => new OpenAIProvider()).toThrow(/OPENAI_API_KEY/);

    if (previous !== undefined) process.env.OPENAI_API_KEY = previous;
  });

  it("maps a successful response to LLMGenerateResponse", async () => {
    const create = vi.fn().mockResolvedValue({
      choices: [{ message: { content: "Merhaba Ender." } }],
      model: "gpt-5.6",
      usage: { prompt_tokens: 12, completion_tokens: 5 },
    });
    const provider = new OpenAIProvider({ client: fakeClient(create) });

    const result = await provider.generate({
      systemPrompt: "You are ENDRA.",
      messages: [{ role: "user", content: "Merhaba" }],
    });

    expect(result).toEqual({
      content: "Merhaba Ender.",
      model: "gpt-5.6",
      usage: { inputTokens: 12, outputTokens: 5 },
    });
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: [
          { role: "system", content: "You are ENDRA." },
          { role: "user", content: "Merhaba" },
        ],
      }),
    );
  });

  it("returns an empty string when the response has no message content", async () => {
    const create = vi.fn().mockResolvedValue({
      choices: [{ message: { content: null } }],
      model: "gpt-5.6",
      usage: { prompt_tokens: 1, completion_tokens: 0 },
    });
    const provider = new OpenAIProvider({ client: fakeClient(create) });

    const result = await provider.generate({ messages: [{ role: "user", content: "hi" }] });

    expect(result.content).toBe("");
  });
});
