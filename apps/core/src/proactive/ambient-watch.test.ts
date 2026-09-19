import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { LLMProvider } from "@endra/agent-contracts";
import { checkAmbientWatch, judgeWorthNotifying } from "./ambient-watch.js";

function fakeLLM(response: string): LLMProvider {
  return {
    name: "fake-provider",
    generate: vi.fn(async () => ({
      content: response,
      model: "fake-model",
      usage: { inputTokens: 1, outputTokens: 1 },
    })),
  };
}

describe("judgeWorthNotifying", () => {
  it("returns nothing to judge and skips the LLM call when there's no new email or event", async () => {
    const llm = fakeLLM('{"shouldNotify": true, "message": "should not be called"}');

    const result = await judgeWorthNotifying(llm, { upcomingEvents: [] });

    expect(result).toEqual({ shouldNotify: false, message: "" });
    expect(llm.generate).not.toHaveBeenCalled();
  });

  it("parses a positive judgment from the model", async () => {
    const llm = fakeLLM('{"shouldNotify": true, "message": "Önemli bir mail geldi."}');

    const result = await judgeWorthNotifying(llm, {
      newEmail: { from: "boss@work.com", subject: "Acil" },
      upcomingEvents: [],
    });

    expect(result).toEqual({ shouldNotify: true, message: "Önemli bir mail geldi." });
  });

  it("treats an unparseable response as not worth notifying", async () => {
    const llm = fakeLLM("not json");

    const result = await judgeWorthNotifying(llm, {
      newEmail: { from: "a@b.com", subject: "x" },
      upcomingEvents: [],
    });

    expect(result).toEqual({ shouldNotify: false, message: "" });
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

const conversationsHandler = () => ({
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
});

describe("checkAmbientWatch", () => {
  it("skips a user whose check was recent", async () => {
    const prefs = preferenceStore({ ambient_watch_last_checked_at: new Date().toISOString() });
    const client = fakeClient({
      users: () => ({ select: async () => ({ data: [{ id: "user-1" }], error: null }) }),
      preferences: prefs.handler,
    });
    const fetchEmail = vi.fn();
    const fetchEvents = vi.fn();

    await checkAmbientWatch(client, vi.fn(), fakeLLM("{}"), fetchEmail, fetchEvents);

    expect(fetchEmail).not.toHaveBeenCalled();
  });

  it("on the first-ever check, seeds the baseline without notifying", async () => {
    const prefs = preferenceStore();
    const client = fakeClient({
      users: () => ({ select: async () => ({ data: [{ id: "user-1" }], error: null }) }),
      preferences: prefs.handler,
    });
    const fetchEmail = vi.fn(async () => ({ id: "email-1", from: "a@b.com", subject: "x" }));
    const fetchEvents = vi.fn(async () => []);
    const deliver = vi.fn();
    const llm = fakeLLM('{"shouldNotify": true, "message": "should not fire on first check"}');

    await checkAmbientWatch(client, deliver, llm, fetchEmail, fetchEvents);

    expect(llm.generate).not.toHaveBeenCalled();
    expect(deliver).not.toHaveBeenCalled();
    expect(
      prefs.upserts.some((u) => (u as { key: string }).key === "ambient_last_seen_email_id"),
    ).toBe(true);
  });

  it("delivers when the model says a new email is worth notifying about", async () => {
    const prefs = preferenceStore({ ambient_last_seen_email_id: "old-email" });
    const client = fakeClient({
      users: () => ({ select: async () => ({ data: [{ id: "user-1" }], error: null }) }),
      preferences: prefs.handler,
      conversations: conversationsHandler,
    });
    const fetchEmail = vi.fn(async () => ({
      id: "new-email",
      from: "boss@work.com",
      subject: "Acil",
    }));
    const fetchEvents = vi.fn(async () => []);
    const deliver = vi.fn().mockResolvedValue(undefined);
    const llm = fakeLLM('{"shouldNotify": true, "message": "Patrondan acil bir mail geldi."}');
    const log = vi.fn();

    await checkAmbientWatch(client, deliver, llm, fetchEmail, fetchEvents, log);

    expect(llm.generate).toHaveBeenCalled();
    expect(deliver).toHaveBeenCalledWith("42", "Patrondan acil bir mail geldi.");
    expect(log).toHaveBeenCalledWith(
      expect.objectContaining({
        checkName: "ambient_watch",
        userId: "user-1",
        status: "success",
        detail: "Patrondan acil bir mail geldi.",
      }),
      client,
    );
  });

  it("does not deliver when the model says it's not worth notifying", async () => {
    const prefs = preferenceStore({ ambient_last_seen_email_id: "old-email" });
    const client = fakeClient({
      users: () => ({ select: async () => ({ data: [{ id: "user-1" }], error: null }) }),
      preferences: prefs.handler,
      conversations: conversationsHandler,
    });
    const fetchEmail = vi.fn(async () => ({
      id: "new-email",
      from: "newsletter@x.com",
      subject: "Bülten",
    }));
    const fetchEvents = vi.fn(async () => []);
    const deliver = vi.fn();
    const llm = fakeLLM('{"shouldNotify": false, "message": ""}');

    await checkAmbientWatch(client, deliver, llm, fetchEmail, fetchEvents);

    expect(deliver).not.toHaveBeenCalled();
    // still tracks the email as seen so it isn't re-evaluated forever.
    expect(
      prefs.upserts.some(
        (u) =>
          (u as { key: string; value: unknown }).key === "ambient_last_seen_email_id" &&
          (u as { value: unknown }).value === "new-email",
      ),
    ).toBe(true);
  });

  it("does not re-notify about an already-notified upcoming event", async () => {
    const prefs = preferenceStore({
      ambient_last_seen_email_id: "e1",
      ambient_notified_event_ids: ["evt-1"],
    });
    const client = fakeClient({
      users: () => ({ select: async () => ({ data: [{ id: "user-1" }], error: null }) }),
      preferences: prefs.handler,
    });
    const fetchEmail = vi.fn(async () => undefined);
    const fetchEvents = vi.fn(async () => [
      { id: "evt-1", summary: "Toplantı", start: "2026-09-19T10:00:00Z" },
    ]);
    const deliver = vi.fn();
    const llm = fakeLLM('{"shouldNotify": true, "message": "should not fire"}');

    await checkAmbientWatch(client, deliver, llm, fetchEmail, fetchEvents);

    expect(llm.generate).not.toHaveBeenCalled();
    expect(deliver).not.toHaveBeenCalled();
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
    });
    const fetchEmail = vi.fn(async () => undefined);
    const fetchEvents = vi.fn(async () => []);
    const log = vi.fn();

    await expect(
      checkAmbientWatch(client, vi.fn(), fakeLLM("{}"), fetchEmail, fetchEvents, log),
    ).resolves.toBeUndefined();

    expect(
      prefs.upserts.some((u) => (u as { key: string }).key === "ambient_watch_last_checked_at"),
    ).toBe(true);
    expect(log).toHaveBeenCalledWith(
      expect.objectContaining({ checkName: "ambient_watch", userId: "user-1", status: "error" }),
      client,
    );
  });
});
