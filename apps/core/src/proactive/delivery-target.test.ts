import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { findDeliveryTarget } from "./delivery-target.js";

describe("findDeliveryTarget", () => {
  it("returns the user's most recently active conversation", async () => {
    const client = {
      from: () => ({
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
    } as unknown as SupabaseClient;

    const result = await findDeliveryTarget("user-1", client);

    expect(result).toEqual({ channel: "telegram", externalConversationId: "42" });
  });

  it("returns undefined when the user has no conversations", async () => {
    const client = {
      from: () => ({
        select: () => ({
          eq: () => ({
            order: () => ({ limit: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
          }),
        }),
      }),
    } as unknown as SupabaseClient;

    const result = await findDeliveryTarget("user-1", client);

    expect(result).toBeUndefined();
  });
});
