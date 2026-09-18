import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { checkMorningDigest, isDigestDue } from "./morning-digest.js";

describe("isDigestDue", () => {
  it("is due when current Istanbul time is past the target and it hasn't run today", () => {
    // 2026-09-19T06:00:00Z = 09:00 in Europe/Istanbul (UTC+3)
    const now = new Date("2026-09-19T06:00:00.000Z");
    expect(isDigestDue(undefined, "08:00", now)).toBe(true);
  });

  it("is not due before the target time", () => {
    // 04:00Z = 07:00 Istanbul, before 08:00
    const now = new Date("2026-09-19T04:00:00.000Z");
    expect(isDigestDue(undefined, "08:00", now)).toBe(false);
  });

  it("is not due again the same Istanbul day even if past the target time", () => {
    const now = new Date("2026-09-19T06:00:00.000Z"); // 09:00 Istanbul
    const lastRunAt = "2026-09-19T05:30:00.000Z"; // 08:30 Istanbul, same day
    expect(isDigestDue(lastRunAt, "08:00", now)).toBe(false);
  });

  it("is due again on a new Istanbul day", () => {
    const now = new Date("2026-09-20T06:00:00.000Z"); // 09:00 Istanbul, next day
    const lastRunAt = "2026-09-19T05:30:00.000Z";
    expect(isDigestDue(lastRunAt, "08:00", now)).toBe(true);
  });
});

function fakeClient(handlers: Record<string, (...args: unknown[]) => unknown>): SupabaseClient {
  return { from: (table: string) => handlers[table]?.() } as unknown as SupabaseClient;
}

function preferenceStore(initial: Record<string, unknown> = {}) {
  const store = { ...initial };
  const upserts: unknown[] = [];
  return {
    upserts,
    handler: () => ({
      select: () => ({
        eq: () => ({
          eq: (_column: string, key: string) => ({
            maybeSingle: async () => ({ data: { value: store[key] }, error: null }),
          }),
        }),
      }),
      upsert: (values: { key: string; value: unknown }) => {
        store[values.key] = values.value;
        upserts.push(values);
        return { error: null };
      },
    }),
  };
}

describe("checkMorningDigest", () => {
  it("skips a user whose digest already ran today", async () => {
    const now = new Date();
    const prefs = preferenceStore({ morning_digest_last_run_at: now.toISOString() });
    const client = fakeClient({
      users: () => ({ select: async () => ({ data: [{ id: "user-1" }], error: null }) }),
      preferences: prefs.handler,
    });
    const deliver = vi.fn();

    await checkMorningDigest(client, deliver);

    expect(deliver).not.toHaveBeenCalled();
  });

  it("does not deliver, but still marks the run, when nothing is worth reporting", async () => {
    const prefs = preferenceStore({ morning_digest_time: "00:00" });
    const client = fakeClient({
      users: () => ({ select: async () => ({ data: [{ id: "user-1" }], error: null }) }),
      preferences: prefs.handler,
      scheduled_jobs: () => ({
        select: () => ({
          eq: () => ({
            eq: () => ({
              gte: () => ({ lte: () => ({ order: async () => ({ data: [], error: null }) }) }),
            }),
          }),
        }),
      }),
      decisions: () => ({
        select: () => ({ eq: () => ({ eq: async () => ({ data: [], error: null }) }) }),
      }),
    });
    const deliver = vi.fn();

    await checkMorningDigest(client, deliver);

    expect(deliver).not.toHaveBeenCalled();
    expect(prefs.upserts).toHaveLength(1);
  });

  it("delivers a digest built from reminders and open decisions due today", async () => {
    const prefs = preferenceStore({ morning_digest_time: "00:00" });
    const client = fakeClient({
      users: () => ({ select: async () => ({ data: [{ id: "user-1" }], error: null }) }),
      preferences: prefs.handler,
      scheduled_jobs: () => ({
        select: () => ({
          eq: () => ({
            eq: () => ({
              gte: () => ({
                lte: () => ({
                  order: async () => ({
                    data: [{ content: "Faturaları öde", due_at: "2026-09-19T10:00:00.000Z" }],
                    error: null,
                  }),
                }),
              }),
            }),
          }),
        }),
      }),
      decisions: () => ({
        select: () => ({
          eq: () => ({
            eq: async () => ({
              data: [{ id: "dec-1", decision: "Yeni işe başlamak", reasoning: null }],
              error: null,
            }),
          }),
        }),
      }),
      conversations: () => ({
        select: () => ({
          eq: () => ({
            order: () => ({
              limit: () => ({
                maybeSingle: async () => ({
                  data: { channel: "telegram", external_conversation_id: "42" },
                  error: null,
                }),
              }),
            }),
          }),
        }),
      }),
    });
    const deliver = vi.fn().mockResolvedValue(undefined);

    await checkMorningDigest(client, deliver);

    expect(deliver).toHaveBeenCalledTimes(1);
    const [conversationId, message] = deliver.mock.calls[0] as [string, string];
    expect(conversationId).toBe("42");
    expect(message).toContain("Faturaları öde");
    expect(message).toContain("Yeni işe başlamak");
    expect(prefs.upserts).toHaveLength(1);
  });

  it("keeps checking other users when one user's check throws", async () => {
    const prefs = preferenceStore({ morning_digest_time: "00:00" });
    let call = 0;
    const client = fakeClient({
      users: () => ({
        select: async () => ({ data: [{ id: "user-1" }, { id: "user-2" }], error: null }),
      }),
      preferences: () => {
        call++;
        if (call === 1) {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  maybeSingle: async () => {
                    throw new Error("db down");
                  },
                }),
              }),
            }),
          };
        }
        return prefs.handler();
      },
      scheduled_jobs: () => ({
        select: () => ({
          eq: () => ({
            eq: () => ({
              gte: () => ({ lte: () => ({ order: async () => ({ data: [], error: null }) }) }),
            }),
          }),
        }),
      }),
      decisions: () => ({
        select: () => ({ eq: () => ({ eq: async () => ({ data: [], error: null }) }) }),
      }),
    });
    const deliver = vi.fn();

    await expect(checkMorningDigest(client, deliver)).resolves.toBeUndefined();

    expect(prefs.upserts).toHaveLength(1);
  });
});
