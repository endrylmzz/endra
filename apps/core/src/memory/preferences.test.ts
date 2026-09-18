import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { deletePreference, getPreference, listPreferences, setPreference } from "./preferences.js";

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

describe("listPreferences", () => {
  it("returns all key/value pairs for the user", async () => {
    const eqCalls: unknown[] = [];
    const client = {
      from: () => ({
        select: () => ({
          eq: (column: string, value: unknown) => {
            eqCalls.push([column, value]);
            return { data: [{ key: "language", value: "tr" }], error: null };
          },
        }),
      }),
    } as unknown as SupabaseClient;

    const result = await listPreferences("user-1", client);

    expect(eqCalls).toEqual([["user_id", "user-1"]]);
    expect(result).toEqual([{ key: "language", value: "tr" }]);
  });
});

describe("deletePreference", () => {
  it("deletes by user_id and key", async () => {
    const eqCalls: unknown[] = [];
    const client = {
      from: () => ({
        delete: () => ({
          eq: (column: string, value: unknown) => {
            eqCalls.push([column, value]);
            return {
              eq: (column2: string, value2: unknown) => {
                eqCalls.push([column2, value2]);
                return { error: null };
              },
            };
          },
        }),
      }),
    } as unknown as SupabaseClient;

    await deletePreference("user-1", "language", client);

    expect(eqCalls).toEqual([
      ["user_id", "user-1"],
      ["key", "language"],
    ]);
  });
});
