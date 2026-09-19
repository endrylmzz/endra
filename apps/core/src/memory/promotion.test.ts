import { describe, expect, it, vi } from "vitest";
import type { LLMProvider } from "@endra/agent-contracts";
import type { SupabaseClient } from "@supabase/supabase-js";
import { extractMemoryCandidates, judgeMemoryConnection, promoteMemories } from "./promotion.js";

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

  function fakeClientWithRelated(relatedData: unknown[]) {
    const upserts: unknown[] = [];
    const client = {
      rpc: vi.fn((fnName: string) => {
        if (fnName === "find_similar_memory") return Promise.resolve({ data: [], error: null });
        if (fnName === "find_related_memories") {
          return Promise.resolve({ data: relatedData, error: null });
        }
        throw new Error(`unexpected rpc ${fnName}`);
      }),
      from: (table: string) => {
        if (table === "memories") {
          return {
            insert: () => ({
              select: () => ({ single: async () => ({ data: { id: "mem-new" }, error: null }) }),
            }),
          };
        }
        if (table === "preferences") {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }),
              }),
            }),
            upsert: (values: unknown) => {
              upserts.push(values);
              return { error: null };
            },
          };
        }
        throw new Error(`unexpected table ${table}`);
      },
    } as unknown as SupabaseClient;
    return { client, upserts };
  }

  it("queues an insight in preferences when the LLM finds a genuine connection", async () => {
    const { client, upserts } = fakeClientWithRelated([
      { id: "mem-old", content: "Ender geçen ay İzmir'e taşınmayı düşünüyordu", similarity: 0.7 },
    ]);
    const llm = fakeLLM(
      '{"hasConnection": true, "insight": "Geçen ay İzmir\'e taşınmayı düşünüyordun, şimdi de İzmir\'de iş görüşmesi var."}',
    );

    await promoteMemories(
      "user-1",
      [{ type: "semantic", content: "Ender İzmir'de bir iş görüşmesine gidiyor", importance: 0.7 }],
      client,
      fakeEmbed,
      llm,
    );

    expect(upserts).toHaveLength(1);
    expect((upserts[0] as { key: string; value: string[] }).key).toBe("pending_memory_insights");
    expect((upserts[0] as { key: string; value: string[] }).value).toEqual([
      "Geçen ay İzmir'e taşınmayı düşünüyordun, şimdi de İzmir'de iş görüşmesi var.",
    ]);
  });

  it("does not queue anything when the LLM finds no genuine connection", async () => {
    const { client, upserts } = fakeClientWithRelated([
      { id: "mem-old", content: "alakasız bir eski not", similarity: 0.6 },
    ]);
    const llm = fakeLLM('{"hasConnection": false, "insight": ""}');

    await promoteMemories(
      "user-1",
      [{ type: "semantic", content: "yeni bir bilgi", importance: 0.6 }],
      client,
      fakeEmbed,
      llm,
    );

    expect(upserts).toHaveLength(0);
  });

  it("does not call the LLM at all when there are no related memories", async () => {
    const { client, upserts } = fakeClientWithRelated([]);
    const llm = fakeLLM('{"hasConnection": true, "insight": "should not be reached"}');

    await promoteMemories(
      "user-1",
      [{ type: "semantic", content: "yeni bilgi", importance: 0.6 }],
      client,
      fakeEmbed,
      llm,
    );

    expect(llm.generate).not.toHaveBeenCalled();
    expect(upserts).toHaveLength(0);
  });

  it("still saves the memory even if the connection check itself throws", async () => {
    const client = {
      rpc: vi.fn((fnName: string) => {
        if (fnName === "find_similar_memory") return Promise.resolve({ data: [], error: null });
        if (fnName === "find_related_memories") return Promise.reject(new Error("rpc down"));
        throw new Error(`unexpected rpc ${fnName}`);
      }),
      from: () => ({
        insert: () => ({
          select: () => ({ single: async () => ({ data: { id: "mem-new" }, error: null }) }),
        }),
      }),
    } as unknown as SupabaseClient;

    await expect(
      promoteMemories(
        "user-1",
        [{ type: "semantic", content: "yeni bilgi", importance: 0.6 }],
        client,
        fakeEmbed,
      ),
    ).resolves.toBeUndefined();
  });
});

describe("judgeMemoryConnection", () => {
  it("skips the LLM call entirely when there are no related memories", async () => {
    const llm = fakeLLM('{"hasConnection": true, "insight": "should not be reached"}');

    const result = await judgeMemoryConnection(llm, "yeni bilgi", []);

    expect(result).toEqual({ hasConnection: false, insight: "" });
    expect(llm.generate).not.toHaveBeenCalled();
  });

  it("parses a positive judgment", async () => {
    const llm = fakeLLM('{"hasConnection": true, "insight": "İlginç bir bağlantı var."}');

    const result = await judgeMemoryConnection(llm, "yeni bilgi", [{ content: "eski bilgi" }]);

    expect(result).toEqual({ hasConnection: true, insight: "İlginç bir bağlantı var." });
  });

  it("treats an unparseable response as no connection", async () => {
    const llm = fakeLLM("not json");

    const result = await judgeMemoryConnection(llm, "yeni bilgi", [{ content: "eski bilgi" }]);

    expect(result).toEqual({ hasConnection: false, insight: "" });
  });
});
