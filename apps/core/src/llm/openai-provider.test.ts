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

  it("sends tool definitions in OpenAI's function-calling format", async () => {
    const create = vi.fn().mockResolvedValue({
      choices: [{ message: { content: "ok" } }],
      model: "gpt-5.6",
      usage: { prompt_tokens: 1, completion_tokens: 1 },
    });
    const provider = new OpenAIProvider({ client: fakeClient(create) });

    await provider.generate({
      messages: [{ role: "user", content: "hi" }],
      tools: [{ name: "get_time", description: "gets the time", inputSchema: { type: "object" } }],
    });

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        tools: [
          {
            type: "function",
            function: {
              name: "get_time",
              description: "gets the time",
              parameters: { type: "object" },
            },
          },
        ],
      }),
    );
  });

  it("parses tool calls out of the response", async () => {
    const create = vi.fn().mockResolvedValue({
      choices: [
        {
          message: {
            content: null,
            tool_calls: [
              { id: "call_1", type: "function", function: { name: "get_time", arguments: "{}" } },
            ],
          },
        },
      ],
      model: "gpt-5.6",
      usage: { prompt_tokens: 1, completion_tokens: 1 },
    });
    const provider = new OpenAIProvider({ client: fakeClient(create) });

    const result = await provider.generate({
      messages: [{ role: "user", content: "what time is it" }],
    });

    expect(result.toolCalls).toEqual([{ id: "call_1", name: "get_time", arguments: {} }]);
  });

  it("sends assistant tool-call history and tool-result messages in OpenAI's shape", async () => {
    const create = vi.fn().mockResolvedValue({
      choices: [{ message: { content: "done" } }],
      model: "gpt-5.6",
      usage: { prompt_tokens: 1, completion_tokens: 1 },
    });
    const provider = new OpenAIProvider({ client: fakeClient(create) });

    await provider.generate({
      messages: [
        { role: "user", content: "what time is it" },
        {
          role: "assistant",
          content: "",
          toolCalls: [{ id: "call_1", name: "get_time", arguments: {} }],
        },
        { role: "tool", toolCallId: "call_1", content: '"2026-01-01T00:00:00Z"' },
      ],
    });

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: expect.arrayContaining([
          {
            role: "assistant",
            content: null,
            tool_calls: [
              { id: "call_1", type: "function", function: { name: "get_time", arguments: "{}" } },
            ],
          },
          { role: "tool", tool_call_id: "call_1", content: '"2026-01-01T00:00:00Z"' },
        ]),
      }),
    );
  });

  it("builds multimodal content when a user message has imageUrls", async () => {
    const create = vi.fn().mockResolvedValue({
      choices: [{ message: { content: "Bir kedi görüyorum." } }],
      model: "gpt-5.6",
      usage: { prompt_tokens: 1, completion_tokens: 1 },
    });
    const provider = new OpenAIProvider({ client: fakeClient(create) });

    await provider.generate({
      messages: [
        {
          role: "user",
          content: "Bu ne?",
          imageUrls: ["data:image/jpeg;base64,AAAA"],
        },
      ],
    });

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: "Bu ne?" },
              { type: "image_url", image_url: { url: "data:image/jpeg;base64,AAAA" } },
            ],
          },
        ],
      }),
    );
  });
});
