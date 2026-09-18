import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createDeletePreferenceTool,
  createListPreferencesTool,
  createSetPreferenceTool,
} from "./preferences.js";

describe("createSetPreferenceTool", () => {
  it("is a write tool that does not require confirmation", () => {
    const tool = createSetPreferenceTool({} as SupabaseClient);
    expect(tool.riskLevel).toBe("write");
    expect(tool.requiresConfirmation).toBe(false);
  });

  it("upserts the preference scoped to the calling user", async () => {
    const upsertCalls: unknown[] = [];
    const client = {
      from: () => ({
        upsert: (values: unknown, options: unknown) => {
          upsertCalls.push({ values, options });
          return { error: null };
        },
      }),
    } as unknown as SupabaseClient;
    const tool = createSetPreferenceTool(client);

    const result = await tool.execute(
      { key: "reply_style", value: "kısa ve direkt" },
      { userId: "user-1", conversationId: "conv-1" },
    );

    expect(upsertCalls).toEqual([
      {
        values: { user_id: "user-1", key: "reply_style", value: "kısa ve direkt" },
        options: { onConflict: "user_id,key" },
      },
    ]);
    expect(result).toEqual({
      success: true,
      data: { key: "reply_style", value: "kısa ve direkt" },
    });
  });
});

describe("createListPreferencesTool", () => {
  it("is a read tool that never requires confirmation", () => {
    const tool = createListPreferencesTool({} as SupabaseClient);
    expect(tool.riskLevel).toBe("read");
    expect(tool.requiresConfirmation).toBe(false);
  });

  it("lists the calling user's preferences", async () => {
    const eqCalls: unknown[] = [];
    const client = {
      from: () => ({
        select: () => ({
          eq: (column: string, value: unknown) => {
            eqCalls.push([column, value]);
            return { data: [{ key: "reply_style", value: "kısa" }], error: null };
          },
        }),
      }),
    } as unknown as SupabaseClient;
    const tool = createListPreferencesTool(client);

    const result = await tool.execute({}, { userId: "user-1", conversationId: "conv-1" });

    expect(eqCalls).toEqual([["user_id", "user-1"]]);
    expect(result).toEqual({ success: true, data: [{ key: "reply_style", value: "kısa" }] });
  });
});

describe("createDeletePreferenceTool", () => {
  it("is a write tool that requires confirmation", () => {
    const tool = createDeletePreferenceTool({} as SupabaseClient);
    expect(tool.riskLevel).toBe("write");
    expect(tool.requiresConfirmation).toBe(true);
  });

  it("deletes only the calling user's preference with the given key", async () => {
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
    const tool = createDeletePreferenceTool(client);

    const result = await tool.execute(
      { key: "reply_style" },
      { userId: "user-1", conversationId: "conv-1" },
    );

    expect(eqCalls).toEqual([
      ["user_id", "user-1"],
      ["key", "reply_style"],
    ]);
    expect(result).toEqual({ success: true, data: { deleted: "reply_style" } });
  });
});
