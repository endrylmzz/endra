import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createCancelReminderTool,
  createListRemindersTool,
  createSetReminderTool,
} from "./reminders.js";

describe("createSetReminderTool", () => {
  it("is a write tool that does not require confirmation", () => {
    const tool = createSetReminderTool({} as SupabaseClient);
    expect(tool.riskLevel).toBe("write");
    expect(tool.requiresConfirmation).toBe(false);
  });

  it("inserts a reminder scoped to the calling user and conversation", async () => {
    const insertCalls: unknown[] = [];
    const client = {
      from: () => ({
        insert: (values: unknown) => {
          insertCalls.push(values);
          return {
            select: () => ({ single: async () => ({ data: { id: "job-1" }, error: null }) }),
          };
        },
      }),
    } as unknown as SupabaseClient;
    const tool = createSetReminderTool(client);

    const result = await tool.execute(
      { content: "sütü al", dueAt: "2026-09-16T10:00:00.000Z" },
      { userId: "user-1", conversationId: "conv-1" },
    );

    expect(insertCalls).toEqual([
      {
        user_id: "user-1",
        conversation_id: "conv-1",
        content: "sütü al",
        due_at: "2026-09-16T10:00:00.000Z",
      },
    ]);
    expect(result).toEqual({
      success: true,
      data: { id: "job-1", content: "sütü al", dueAt: "2026-09-16T10:00:00.000Z" },
    });
  });

  it("rejects an invalid dueAt without touching the database", async () => {
    const tool = createSetReminderTool({} as SupabaseClient);

    const result = await tool.execute(
      { content: "x", dueAt: "not-a-date" },
      { userId: "user-1", conversationId: "conv-1" },
    );

    expect(result.success).toBe(false);
  });
});

describe("createListRemindersTool", () => {
  it("is a read tool that never requires confirmation", () => {
    const tool = createListRemindersTool({} as SupabaseClient);
    expect(tool.riskLevel).toBe("read");
    expect(tool.requiresConfirmation).toBe(false);
  });

  it("lists only the calling user's pending reminders", async () => {
    const eqCalls: unknown[] = [];
    const client = {
      from: () => ({
        select: () => ({
          eq: (column: string, value: unknown) => {
            eqCalls.push([column, value]);
            return {
              eq: (column2: string, value2: unknown) => {
                eqCalls.push([column2, value2]);
                return {
                  order: async () => ({
                    data: [{ id: "job-1", content: "sütü al", due_at: "2026-09-16T10:00:00.000Z" }],
                    error: null,
                  }),
                };
              },
            };
          },
        }),
      }),
    } as unknown as SupabaseClient;
    const tool = createListRemindersTool(client);

    const result = await tool.execute({}, { userId: "user-1", conversationId: "conv-1" });

    expect(eqCalls).toEqual([
      ["user_id", "user-1"],
      ["status", "pending"],
    ]);
    expect(result).toEqual({
      success: true,
      data: [{ id: "job-1", content: "sütü al", due_at: "2026-09-16T10:00:00.000Z" }],
    });
  });
});

describe("createCancelReminderTool", () => {
  it("is a write tool that requires confirmation", () => {
    const tool = createCancelReminderTool({} as SupabaseClient);
    expect(tool.riskLevel).toBe("write");
    expect(tool.requiresConfirmation).toBe(true);
  });

  it("cancels only the calling user's pending reminder with the given id", async () => {
    const eqCalls: unknown[] = [];
    const client = {
      from: () => ({
        update: () => ({
          eq: (column: string, value: unknown) => {
            eqCalls.push([column, value]);
            return {
              eq: (column2: string, value2: unknown) => {
                eqCalls.push([column2, value2]);
                return {
                  eq: (column3: string, value3: unknown) => {
                    eqCalls.push([column3, value3]);
                    return { error: null };
                  },
                };
              },
            };
          },
        }),
      }),
    } as unknown as SupabaseClient;
    const tool = createCancelReminderTool(client);

    const result = await tool.execute(
      { reminderId: "job-1" },
      { userId: "user-1", conversationId: "conv-1" },
    );

    expect(eqCalls).toEqual([
      ["id", "job-1"],
      ["user_id", "user-1"],
      ["status", "pending"],
    ]);
    expect(result).toEqual({ success: true, data: { cancelled: "job-1" } });
  });
});
