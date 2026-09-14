import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getPreference, setPreference } from "./preferences.js";

describe("getPreference", () => {
  it("returns the stored value", async () => {
    const client = {
      from: () => ({
        select: () => ({
          eq: function () {
            return this;
          },
          maybeSingle: async () => ({ data: { value: "tr" }, error: null }),
        }),
      }),
    } as unknown as SupabaseClient;

    expect(await getPreference("user-1", "language", client)).toBe("tr");
  });

  it("returns undefined when no preference is set", async () => {
    const client = {
      from: () => ({
        select: () => ({
          eq: function () {
            return this;
          },
          maybeSingle: async () => ({ data: null, error: null }),
        }),
      }),
    } as unknown as SupabaseClient;

    expect(await getPreference("user-1", "language", client)).toBeUndefined();
  });
});

describe("setPreference", () => {
  it("upserts on (user_id, key)", async () => {
    const upsertCalls: unknown[] = [];
    const client = {
      from: () => ({
        upsert: (values: unknown, options: unknown) => {
          upsertCalls.push({ values, options });
          return { error: null };
        },
      }),
    } as unknown as SupabaseClient;

    await setPreference("user-1", "language", "tr", client);

    expect(upsertCalls).toEqual([
      {
        values: { user_id: "user-1", key: "language", value: "tr" },
        options: { onConflict: "user_id,key" },
      },
    ]);
  });
});
