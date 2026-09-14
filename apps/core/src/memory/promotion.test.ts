import { describe, expect, it, vi } from "vitest";
import type { LLMProvider } from "@endra/agent-contracts";
import type { SupabaseClient } from "@supabase/supabase-js";
import { extractMemoryCandidates, promoteMemories } from "./promotion.js";

function fakeLLM(content: string): LLMProvider {
  return {
    name: "fake",
    generate: vi.fn().mockResolvedValue({
      content,
      model: "fake-model",
      usage: { inputTokens: 1, outputTokens: 1 },
    }),
  };
}

describe("extractMemoryCandidates", () => {
  it("parses a valid JSON array response", async () => {
    const llm = fakeLLM(
      '[{"type":"project","content":"Ender ENDRA projesini geliştiriyor","importance":0.9}]',
    );

    const result = await extractMemoryCandidates(
      { userMessage: "ENDRA'yı geliştiriyorum", assistantMessage: "Harika!" },
      llm,
    );

    expect(result).toEqual([
      { type: "project", content: "Ender ENDRA projesini geliştiriyor", importance: 0.9 },
    ]);
  });

  it("returns an empty array when the model says nothing is worth remembering", async () => {
    const llm = fakeLLM("[]");

    const result = await extractMemoryCandidates(
      { userMessage: "merhaba", assistantMessage: "merhaba!" },
      llm,
    );

    expect(result).toEqual([]);
  });

  it("returns an empty array if the response isn't valid JSON, instead of throwing", async () => {
    const llm = fakeLLM("bunu unutma: ENDRA harika bir proje");

    const result = await extractMemoryCandidates({ userMessage: "x", assistantMessage: "y" }, llm);

    expect(result).toEqual([]);
  });

  it("filters out malformed items", async () => {
    const llm = fakeLLM('[{"type":"semantic","content":"geçerli","importance":0.5},{"oops":true}]');

    const result = await extractMemoryCandidates({ userMessage: "x", assistantMessage: "y" }, llm);

    expect(result).toEqual([{ type: "semantic", content: "geçerli", importance: 0.5 }]);
  });
});

describe("promoteMemories", () => {
  const fakeEmbed = vi.fn(async () => [0.1, 0.2]);

  it("saves a candidate when no similar memory exists", async () => {
    const insertCalls: unknown[] = [];
    const client = {
      rpc: vi.fn().mockResolvedValue({ data: [], error: null }),
      from: () => ({
        insert: (values: unknown) => {
          insertCalls.push(values);
          return {
            select: () => ({ single: async () => ({ data: { id: "mem-1" }, error: null }) }),
          };
        },
      }),
    } as unknown as SupabaseClient;

    await promoteMemories(
      "user-1",
      [{ type: "semantic", content: "yeni bilgi", importance: 0.6 }],
      client,
      fakeEmbed,
    );

    expect(insertCalls).toHaveLength(1);
  });

  it("skips saving when a similar memory already exists", async () => {
    const insertCalls: unknown[] = [];
    const client = {
      rpc: vi
        .fn()
        .mockResolvedValue({ data: [{ id: "mem-existing", similarity: 0.95 }], error: null }),
      from: () => ({
        insert: (values: unknown) => {
          insertCalls.push(values);
          return {
            select: () => ({ single: async () => ({ data: { id: "mem-2" }, error: null }) }),
          };
        },
      }),
    } as unknown as SupabaseClient;

    await promoteMemories(
      "user-1",
      [{ type: "semantic", content: "tekrar eden bilgi", importance: 0.6 }],
      client,
      fakeEmbed,
    );

    expect(insertCalls).toHaveLength(0);
  });
});
