import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createNotesTool } from "./notes.js";

describe("createNotesTool", () => {
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
