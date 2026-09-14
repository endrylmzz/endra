import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { checkAndDeliverDueJobs, findDueReminders, markReminderStatus } from "./scheduler.js";

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
      { id: "job-1", content: "sütü al", channel: "telegram", externalConversationId: "42" },
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

describe("checkAndDeliverDueJobs", () => {
  it("delivers each due telegram reminder and marks it sent", async () => {
    const updates: unknown[] = [];
    const client = {
      from: () => ({
        select: () => ({
          eq: () => ({
            lte: async () => ({
              data: [
                {
                  id: "job-1",
                  content: "sütü al",
                  conversations: { channel: "telegram", external_conversation_id: "42" },
                },
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
    const deliver = vi.fn().mockResolvedValue(undefined);

    await checkAndDeliverDueJobs(client, deliver);

    expect(deliver).toHaveBeenCalledWith("42", "sütü al");
    expect(updates).toEqual([{ values: { status: "sent" }, column: "id", value: "job-1" }]);
  });

  it("marks a job failed when delivery throws, without stopping other jobs", async () => {
    const updates: unknown[] = [];
    const client = {
      from: () => ({
        select: () => ({
          eq: () => ({
            lte: async () => ({
              data: [
                {
                  id: "job-1",
                  content: "a",
                  conversations: { channel: "telegram", external_conversation_id: "1" },
                },
                {
                  id: "job-2",
                  content: "b",
                  conversations: { channel: "telegram", external_conversation_id: "2" },
                },
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
              data: [
                {
                  id: "job-1",
                  content: "x",
                  conversations: { channel: "web", external_conversation_id: "1" },
                },
              ],
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
