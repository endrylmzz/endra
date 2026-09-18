import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { deleteMemory, listMemories, saveMemory, searchMemories } from "./semantic-memory.js";

const fakeEmbed = vi.fn(async () => [0.1, 0.2, 0.3]);

describe("saveMemory", () => {
  it("embeds the content and inserts a row, returning the new id", async () => {
    const client = {
      from: () => ({
        insert: (values: unknown) => ({
          select: () => ({
            single: async () => ({ data: { id: "mem-1" }, error: null, __values: values }),
          }),
        }),
      }),
    } as unknown as SupabaseClient;

    const id = await saveMemory(
      "user-1",
      { type: "semantic", content: "ENDRA projesi geliştiriliyor", importance: 0.8 },
      client,
      fakeEmbed,
    );

    expect(id).toBe("mem-1");
    expect(fakeEmbed).toHaveBeenCalledWith("ENDRA projesi geliştiriliyor");
  });
});

describe("searchMemories", () => {
  it("embeds the query and calls the search_memories RPC", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [{ id: "mem-1", content: "...", type: "semantic", importance: 0.8, score: 0.9 }],
      error: null,
    });
    const client = { rpc } as unknown as SupabaseClient;

    const result = await searchMemories("user-1", "ENDRA nedir", 5, client, fakeEmbed);

    expect(result).toHaveLength(1);
    expect(rpc).toHaveBeenCalledWith("search_memories", {
      p_user_id: "user-1",
      p_query_embedding: [0.1, 0.2, 0.3],
      p_query_text: "ENDRA nedir",
      p_limit: 5,
    });
  });

  it("throws on an RPC error", async () => {
    const client = {
      rpc: vi.fn().mockResolvedValue({ data: null, error: new Error("rpc failed") }),
    } as unknown as SupabaseClient;

    await expect(searchMemories("user-1", "q", 5, client, fakeEmbed)).rejects.toThrow("rpc failed");
  });
});

describe("listMemories", () => {
  it("returns the user's memories, newest first", async () => {
    const eqCalls: unknown[] = [];
    const client = {
      from: () => ({
        select: () => ({
          eq: (column: string, value: unknown) => {
            eqCalls.push([column, value]);
            return {
              order: () => ({
                limit: async () => ({
                  data: [
                    {
                      id: "mem-1",
                      content: "eski bir hatıra",
                      type: "semantic",
                      importance: 0.3,
                      created_at: "2026-01-01T00:00:00.000Z",
                    },
                  ],
                  error: null,
                }),
              }),
            };
          },
        }),
      }),
    } as unknown as SupabaseClient;

    const result = await listMemories("user-1", 20, client);

    expect(eqCalls).toEqual([["user_id", "user-1"]]);
    expect(result).toEqual([
      {
        id: "mem-1",
        content: "eski bir hatıra",
        type: "semantic",
        importance: 0.3,
        createdAt: "2026-01-01T00:00:00.000Z",
      },
    ]);
  });
});

describe("deleteMemory", () => {
  it("deletes only the calling user's memory with the given id", async () => {
    const eqCalls: unknown[] = [];
    const client = {
      from: () => ({
        delete: () => ({
          eq: (column: string, value: unknown) => {
            eqCalls.push([column, value]);
            return {
              eq: (column2: string, value2: unknown) => {
                eqCalls.push([column2, value2]);
                return { error: null };
              },
            };
          },
        }),
      }),
    } as unknown as SupabaseClient;

    await deleteMemory("user-1", "mem-1", client);

    expect(eqCalls).toEqual([
      ["id", "mem-1"],
      ["user_id", "user-1"],
    ]);
  });
});
