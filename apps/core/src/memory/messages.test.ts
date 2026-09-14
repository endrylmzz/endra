import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { saveMessage, getRecentMessages } from "./messages.js";

describe("saveMessage", () => {
  it("inserts a row with the conversation id, role, and content", async () => {
    const insertCalls: unknown[] = [];
    const client = {
      from: () => ({
        insert: (values: unknown) => {
          insertCalls.push(values);
          return { error: null };
        },
      }),
    } as unknown as SupabaseClient;

    await saveMessage("conv-1", { role: "user", content: "merhaba" }, client);

    expect(insertCalls).toEqual([{ conversation_id: "conv-1", role: "user", content: "merhaba" }]);
  });

  it("throws on an insert error", async () => {
    const client = {
      from: () => ({
        insert: () => ({ error: new Error("insert failed") }),
      }),
    } as unknown as SupabaseClient;

    await expect(saveMessage("conv-1", { role: "user", content: "hi" }, client)).rejects.toThrow(
      "insert failed",
    );
  });
});

describe("getRecentMessages", () => {
  function chainReturning(result: { data: unknown; error: unknown }) {
    const chain = {
      eq: () => chain,
      order: () => chain,
      limit: async () => result,
    };
    return chain;
  }

  it("returns messages in chronological order (oldest first)", async () => {
    const client = {
      from: () => ({
        select: () =>
          chainReturning({
            data: [
              { role: "assistant", content: "newest" },
              { role: "user", content: "oldest" },
            ],
            error: null,
          }),
      }),
    } as unknown as SupabaseClient;

    const result = await getRecentMessages("conv-1", 20, client);

    expect(result).toEqual([
      { role: "user", content: "oldest" },
      { role: "assistant", content: "newest" },
    ]);
  });

  it("throws on a select error", async () => {
    const client = {
      from: () => ({
        select: () => chainReturning({ data: null, error: new Error("select failed") }),
      }),
    } as unknown as SupabaseClient;

    await expect(getRecentMessages("conv-1", 20, client)).rejects.toThrow("select failed");
  });
});
