import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createDeleteMemoryTool, createListMemoriesTool } from "./memories.js";

describe("createListMemoriesTool", () => {
  it("is a read tool that never requires confirmation", () => {
    const tool = createListMemoriesTool({} as SupabaseClient);
    expect(tool.riskLevel).toBe("read");
    expect(tool.requiresConfirmation).toBe(false);
  });

  it("lists the calling user's memories", async () => {
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
                      content: "x",
                      type: "semantic",
                      importance: 0.3,
                      created_at: "t",
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
    const tool = createListMemoriesTool(client);

    const result = await tool.execute({}, { userId: "user-1", conversationId: "conv-1" });

    expect(eqCalls).toEqual([["user_id", "user-1"]]);
    expect(result).toEqual({
      success: true,
      data: [{ id: "mem-1", content: "x", type: "semantic", importance: 0.3, createdAt: "t" }],
    });
  });
});

describe("createDeleteMemoryTool", () => {
  it("is a write tool that requires confirmation", () => {
    const tool = createDeleteMemoryTool({} as SupabaseClient);
    expect(tool.riskLevel).toBe("write");
    expect(tool.requiresConfirmation).toBe(true);
  });

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
    const tool = createDeleteMemoryTool(client);

    const result = await tool.execute(
      { memoryId: "mem-1" },
      { userId: "user-1", conversationId: "conv-1" },
    );

    expect(eqCalls).toEqual([
      ["id", "mem-1"],
      ["user_id", "user-1"],
    ]);
    expect(result).toEqual({ success: true, data: { deleted: "mem-1" } });
  });
});
