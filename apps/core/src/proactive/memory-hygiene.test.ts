import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { checkMemoryHygiene, findStaleMemories } from "./memory-hygiene.js";

function fakeClient(handlers: Record<string, (...args: unknown[]) => unknown>): SupabaseClient {
  return { from: (table: string) => handlers[table]?.() } as unknown as SupabaseClient;
}

describe("findStaleMemories", () => {
  it("queries low-importance, old memories ordered by importance ascending", async () => {
    const client = fakeClient({
      memories: () => ({
        select: () => ({
          eq: () => ({
            lt: () => ({
              lt: () => ({
                order: () => ({
                  limit: async () => ({
                    data: [
                      {
                        id: "mem-1",
                        content: "eski bilgi",
                        type: "semantic",
                        importance: 0.2,
                        created_at: "2026-01-01T00:00:00.000Z",
                      },
                    ],
                    error: null,
                  }),
                }),
              }),
            }),
          }),
        }),
      }),
    });

    const result = await findStaleMemories("user-1", client);

    expect(result).toEqual([
      {
        id: "mem-1",
        content: "eski bilgi",
        type: "semantic",
        importance: 0.2,
        createdAt: "2026-01-01T00:00:00.000Z",
      },
    ]);
  });
});

describe("checkMemoryHygiene", () => {
  function preferenceStore(initial: Record<string, unknown> = {}) {
    const store = { ...initial };
    const upserts: unknown[] = [];
    return {
      upserts,
      handler: () => ({
        select: () => ({
          eq: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: { value: store["memory_hygiene_last_run_at"] },
                error: null,
              }),
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

  it("skips a user whose last run was recent", async () => {
    const prefs = preferenceStore({ memory_hygiene_last_run_at: new Date().toISOString() });
    const client = fakeClient({
      users: () => ({ select: async () => ({ data: [{ id: "user-1" }], error: null }) }),
      preferences: prefs.handler,
    });
    const deliver = vi.fn();

    await checkMemoryHygiene(client, deliver);

    expect(deliver).not.toHaveBeenCalled();
    expect(prefs.upserts).toEqual([]);
  });

  it("delivers a digest and marks the run when due and stale memories exist", async () => {
    const prefs = preferenceStore(); // never run before
    const client = fakeClient({
      users: () => ({ select: async () => ({ data: [{ id: "user-1" }], error: null }) }),
      preferences: prefs.handler,
      memories: () => ({
        select: () => ({
          eq: () => ({
            lt: () => ({
              lt: () => ({
                order: () => ({
                  limit: async () => ({
                    data: [
                      {
                        id: "mem-1",
                        content: "eski bilgi",
                        type: "semantic",
                        importance: 0.1,
                        created_at: "2020-01-01",
                      },
                    ],
                    error: null,
                  }),
                }),
              }),
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
    const log = vi.fn();

    await checkMemoryHygiene(client, deliver, log);

    expect(deliver).toHaveBeenCalledWith("42", expect.stringContaining("eski bilgi"));
    expect(prefs.upserts).toHaveLength(1);
    expect((prefs.upserts[0] as { key: string }).key).toBe("memory_hygiene_last_run_at");
    expect(log).toHaveBeenCalledWith(
      expect.objectContaining({ checkName: "memory_hygiene", userId: "user-1", status: "success" }),
      client,
    );
  });

  it("does not deliver when due but no stale memories exist, but still marks the run", async () => {
    const prefs = preferenceStore();
    const client = fakeClient({
      users: () => ({ select: async () => ({ data: [{ id: "user-1" }], error: null }) }),
      preferences: prefs.handler,
      memories: () => ({
        select: () => ({
          eq: () => ({
            lt: () => ({
              lt: () => ({ order: () => ({ limit: async () => ({ data: [], error: null }) }) }),
            }),
          }),
        }),
      }),
    });
    const deliver = vi.fn();

    await checkMemoryHygiene(client, deliver);

    expect(deliver).not.toHaveBeenCalled();
    expect(prefs.upserts).toHaveLength(1);
  });

  it("keeps checking other users when one user's check throws", async () => {
    const prefs = preferenceStore();
    let call = 0;
    const client = fakeClient({
      users: () => ({
        select: async () => ({ data: [{ id: "user-1" }, { id: "user-2" }], error: null }),
      }),
      preferences: () => {
        call++;
        if (call === 1) {
          // user-1's getPreference blows up
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
      memories: () => ({
        select: () => ({
          eq: () => ({
            lt: () => ({
              lt: () => ({ order: () => ({ limit: async () => ({ data: [], error: null }) }) }),
            }),
          }),
        }),
      }),
    });
    const deliver = vi.fn();
    const log = vi.fn();

    await expect(checkMemoryHygiene(client, deliver, log)).resolves.toBeUndefined();

    // user-2 still got processed (its run got marked) despite user-1 throwing.
    expect(prefs.upserts).toHaveLength(1);
    expect(log).toHaveBeenCalledWith(
      expect.objectContaining({ checkName: "memory_hygiene", userId: "user-1", status: "error" }),
      client,
    );
  });
});
