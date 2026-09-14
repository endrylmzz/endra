import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createDeleteNoteTool, createListNotesTool, createNotesTool } from "./notes.js";

describe("createNotesTool (save_note)", () => {
  it("is a write tool that requires confirmation", () => {
    const tool = createNotesTool({} as SupabaseClient);
    expect(tool.riskLevel).toBe("write");
    expect(tool.requiresConfirmation).toBe(true);
  });

  it("inserts a note scoped to the calling user", async () => {
    const insertCalls: unknown[] = [];
    const client = {
      from: () => ({
        insert: (values: unknown) => {
          insertCalls.push(values);
          return { error: null };
        },
      }),
    } as unknown as SupabaseClient;
    const tool = createNotesTool(client);

    const result = await tool.execute(
      { content: "sütü al" },
      { userId: "user-1", conversationId: "conv-1" },
    );

    expect(result).toEqual({ success: true, data: { saved: "sütü al" } });
    expect(insertCalls).toEqual([{ user_id: "user-1", content: "sütü al" }]);
  });

  it("returns a failure result when the insert fails", async () => {
    const client = {
      from: () => ({ insert: () => ({ error: { message: "db down" } }) }),
    } as unknown as SupabaseClient;
    const tool = createNotesTool(client);

    const result = await tool.execute(
      { content: "x" },
      { userId: "user-1", conversationId: "conv-1" },
    );

    expect(result).toEqual({ success: false, error: "db down" });
  });
});

describe("createListNotesTool", () => {
  it("is a read tool that never requires confirmation", () => {
    const tool = createListNotesTool({} as SupabaseClient);
    expect(tool.riskLevel).toBe("read");
    expect(tool.requiresConfirmation).toBe(false);
  });

  it("lists notes scoped to the calling user", async () => {
    const eqCalls: unknown[] = [];
    const client = {
      from: () => ({
        select: () => ({
          eq: (column: string, value: unknown) => {
            eqCalls.push([column, value]);
            return {
              order: async () => ({
                data: [{ id: "n1", content: "sütü al", created_at: "2026-01-01" }],
                error: null,
              }),
            };
          },
        }),
      }),
    } as unknown as SupabaseClient;
    const tool = createListNotesTool(client);

    const result = await tool.execute({}, { userId: "user-1", conversationId: "conv-1" });

    expect(eqCalls).toEqual([["user_id", "user-1"]]);
    expect(result).toEqual({
      success: true,
      data: [{ id: "n1", content: "sütü al", created_at: "2026-01-01" }],
    });
  });
});

describe("createDeleteNoteTool", () => {
  it("is a write tool that requires confirmation", () => {
    const tool = createDeleteNoteTool({} as SupabaseClient);
    expect(tool.riskLevel).toBe("write");
    expect(tool.requiresConfirmation).toBe(true);
  });

  it("deletes only the calling user's note with the given id", async () => {
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
    const tool = createDeleteNoteTool(client);

    const result = await tool.execute(
      { noteId: "n1" },
      { userId: "user-1", conversationId: "conv-1" },
    );

    expect(eqCalls).toEqual([
      ["id", "n1"],
      ["user_id", "user-1"],
    ]);
    expect(result).toEqual({ success: true, data: { deleted: "n1" } });
  });
});
