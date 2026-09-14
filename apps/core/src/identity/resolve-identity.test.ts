import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveIdentity } from "./resolve-identity.js";

function selectChain(result: { data: unknown; error: unknown }) {
  const chain = {
    eq: () => chain,
    maybeSingle: async () => result,
  };
  return chain;
}

function fakeClient(options: {
  userSelect: { data: unknown; error: unknown };
  userInsert?: { data: unknown; error: unknown };
  conversationSelect: { data: unknown; error: unknown };
  conversationInsert?: { data: unknown; error: unknown };
}): { client: SupabaseClient; insertCalls: Array<{ table: string; values: unknown }> } {
  const insertCalls: Array<{ table: string; values: unknown }> = [];

  const client = {
    from: (table: string) => ({
      select: () =>
        selectChain(table === "users" ? options.userSelect : options.conversationSelect),
      insert: (values: unknown) => {
        insertCalls.push({ table, values });
        const result = table === "users" ? options.userInsert : options.conversationInsert;
        return {
          select: () => ({
            single: async () => result,
          }),
        };
      },
    }),
  } as unknown as SupabaseClient;

  return { client, insertCalls };
}

describe("resolveIdentity", () => {
  it("returns existing ids without inserting when the user and conversation already exist", async () => {
    const { client, insertCalls } = fakeClient({
      userSelect: { data: { id: "user-1" }, error: null },
      conversationSelect: { data: { id: "conv-1" }, error: null },
    });

    const result = await resolveIdentity(
      { channel: "api", externalUserId: "ender", externalConversationId: "c1" },
      client,
    );

    expect(result).toEqual({ userId: "user-1", conversationId: "conv-1" });
    expect(insertCalls).toEqual([]);
  });

  it("creates a new user and conversation when neither exists", async () => {
    const { client, insertCalls } = fakeClient({
      userSelect: { data: null, error: null },
      userInsert: { data: { id: "new-user" }, error: null },
      conversationSelect: { data: null, error: null },
      conversationInsert: { data: { id: "new-conv" }, error: null },
    });

    const result = await resolveIdentity(
      { channel: "api", externalUserId: "ender", externalConversationId: "c1" },
      client,
    );

    expect(result).toEqual({ userId: "new-user", conversationId: "new-conv" });
    expect(insertCalls).toEqual([
      { table: "users", values: { external_id: "ender" } },
      {
        table: "conversations",
        values: { user_id: "new-user", channel: "api", external_conversation_id: "c1" },
      },
    ]);
  });

  it("propagates a select error instead of silently continuing", async () => {
    const { client } = fakeClient({
      userSelect: { data: null, error: new Error("db down") },
      conversationSelect: { data: null, error: null },
    });

    await expect(
      resolveIdentity(
        { channel: "api", externalUserId: "ender", externalConversationId: "c1" },
        client,
      ),
    ).rejects.toThrow("db down");
  });
});
