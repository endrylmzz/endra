import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  checkAndDeliverDueJobs,
  findDueReminders,
  incrementRetryCount,
  markReminderStatus,
  rescheduleReminder,
} from "./scheduler.js";

describe("findDueReminders", () => {
  it("maps due, pending jobs joined with their conversation's channel/external id", async () => {
    const client = {
      from: () => ({
        select: () => ({
          eq: () => ({
            lte: async () => ({
              data: [
                {
                  id: "job-1",
                  content: "sütü al",
                  due_at: "2026-09-16T09:00:00.000Z",
                  recurrence_seconds: null,
                  retry_count: 0,
                  conversations: { channel: "telegram", external_conversation_id: "42" },
                },
              ],
              error: null,
            }),
          }),
        }),
      }),
    } as unknown as SupabaseClient;

    const result = await findDueReminders(client);

    expect(result).toEqual([
      {
        id: "job-1",
        content: "sütü al",
        dueAt: "2026-09-16T09:00:00.000Z",
        recurrenceSeconds: null,
        retryCount: 0,
        channel: "telegram",
        externalConversationId: "42",
      },
    ]);
  });
});

describe("markReminderStatus", () => {
  it("updates the job's status by id", async () => {
    const eqCalls: unknown[] = [];
    const client = {
      from: () => ({
        update: (values: unknown) => ({
          eq: (column: string, value: unknown) => {
            eqCalls.push([values, column, value]);
            return { error: null };
          },
        }),
      }),
    } as unknown as SupabaseClient;

    await markReminderStatus("job-1", "sent", client);

    expect(eqCalls).toEqual([[{ status: "sent" }, "id", "job-1"]]);
  });
});

describe("rescheduleReminder", () => {
  it("sets the next due_at, resets status to pending and retry_count to 0", async () => {
    const eqCalls: unknown[] = [];
    const client = {
      from: () => ({
        update: (values: unknown) => ({
          eq: (column: string, value: unknown) => {
            eqCalls.push([values, column, value]);
            return { error: null };
          },
        }),
      }),
    } as unknown as SupabaseClient;

    await rescheduleReminder("job-1", "2026-09-17T09:00:00.000Z", client);

    expect(eqCalls).toEqual([
      [{ due_at: "2026-09-17T09:00:00.000Z", status: "pending", retry_count: 0 }, "id", "job-1"],
    ]);
  });
});

describe("incrementRetryCount", () => {
  it("sets retry_count by id", async () => {
    const eqCalls: unknown[] = [];
    const client = {
      from: () => ({
        update: (values: unknown) => ({
          eq: (column: string, value: unknown) => {
            eqCalls.push([values, column, value]);
            return { error: null };
          },
        }),
      }),
    } as unknown as SupabaseClient;

    await incrementRetryCount("job-1", 2, client);

    expect(eqCalls).toEqual([[{ retry_count: 2 }, "id", "job-1"]]);
  });
});

function dueRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "job-1",
    content: "sütü al",
    due_at: "2026-09-16T09:00:00.000Z",
    recurrence_seconds: null,
    retry_count: 0,
    conversations: { channel: "telegram", external_conversation_id: "42" },
    ...overrides,
  };
}

describe("checkAndDeliverDueJobs", () => {
  it("delivers a one-shot reminder and marks it sent", async () => {
    const updates: unknown[] = [];
    const client = {
      from: () => ({
        select: () => ({
          eq: () => ({ lte: async () => ({ data: [dueRow()], error: null }) }),
        }),
        update: (values: unknown) => ({
          eq: (column: string, value: unknown) => {
            updates.push({ values, column, value });
            return { error: null };
          },
        }),
      }),
    } as unknown as SupabaseClient;
    const deliver = vi.fn().mockResolvedValue(undefined);

    await checkAndDeliverDueJobs(client, deliver);

    expect(deliver).toHaveBeenCalledWith("42", "sütü al");
    expect(updates).toEqual([{ values: { status: "sent" }, column: "id", value: "job-1" }]);
  });

  it("reschedules a recurring reminder to due_at + interval instead of marking it sent", async () => {
    const updates: unknown[] = [];
    const client = {
      from: () => ({
        select: () => ({
          eq: () => ({
            lte: async () => ({
              data: [dueRow({ due_at: "2026-09-16T09:00:00.000Z", recurrence_seconds: 86400 })],
              error: null,
            }),
          }),
        }),
        update: (values: unknown) => ({
          eq: (column: string, value: unknown) => {
            updates.push({ values, column, value });
            return { error: null };
          },
        }),
      }),
    } as unknown as SupabaseClient;
    const deliver = vi.fn().mockResolvedValue(undefined);

    await checkAndDeliverDueJobs(client, deliver);

    expect(updates).toEqual([
      {
        values: { due_at: "2026-09-17T09:00:00.000Z", status: "pending", retry_count: 0 },
        column: "id",
        value: "job-1",
      },
    ]);
  });

  it("increments retry_count instead of marking failed when under the retry limit", async () => {
    const updates: unknown[] = [];
    const client = {
      from: () => ({
        select: () => ({
          eq: () => ({ lte: async () => ({ data: [dueRow({ retry_count: 1 })], error: null }) }),
        }),
        update: (values: unknown) => ({
          eq: (column: string, value: unknown) => {
            updates.push({ values, column, value });
            return { error: null };
          },
        }),
      }),
    } as unknown as SupabaseClient;
    const deliver = vi.fn().mockRejectedValue(new Error("push failed"));

    await checkAndDeliverDueJobs(client, deliver);

    expect(updates).toEqual([{ values: { retry_count: 2 }, column: "id", value: "job-1" }]);
  });

  it("marks failed once the retry limit is reached, without stopping other jobs", async () => {
    const updates: unknown[] = [];
    const client = {
      from: () => ({
        select: () => ({
          eq: () => ({
            lte: async () => ({
              data: [
                dueRow({
                  id: "job-1",
                  content: "a",
                  retry_count: 3,
                  conversations: { channel: "telegram", external_conversation_id: "1" },
                }),
                dueRow({
                  id: "job-2",
                  content: "b",
                  conversations: { channel: "telegram", external_conversation_id: "2" },
                }),
              ],
              error: null,
            }),
          }),
        }),
        update: (values: unknown) => ({
          eq: (column: string, value: unknown) => {
            updates.push({ values, column, value });
            return { error: null };
          },
        }),
      }),
    } as unknown as SupabaseClient;
    const deliver = vi
      .fn()
      .mockRejectedValueOnce(new Error("push failed"))
      .mockResolvedValueOnce(undefined);

    await checkAndDeliverDueJobs(client, deliver);

    expect(deliver).toHaveBeenCalledTimes(2);
    expect(updates).toEqual([
      { values: { status: "failed" }, column: "id", value: "job-1" },
      { values: { status: "sent" }, column: "id", value: "job-2" },
    ]);
  });

  it("skips jobs from a channel with no delivery path", async () => {
    const client = {
      from: () => ({
        select: () => ({
          eq: () => ({
            lte: async () => ({
              data: [dueRow({ conversations: { channel: "web", external_conversation_id: "1" } })],
              error: null,
            }),
          }),
        }),
        update: () => ({ eq: () => ({ error: null }) }),
      }),
    } as unknown as SupabaseClient;
    const deliver = vi.fn();

    await checkAndDeliverDueJobs(client, deliver);

    expect(deliver).not.toHaveBeenCalled();
  });
});
