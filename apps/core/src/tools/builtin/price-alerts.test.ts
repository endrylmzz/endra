import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createCancelPriceAlertTool,
  createListPriceAlertsTool,
  createSetPriceAlertTool,
} from "./price-alerts.js";

describe("createSetPriceAlertTool", () => {
  it("is a write tool that does not require confirmation", () => {
    const tool = createSetPriceAlertTool({} as SupabaseClient);
    expect(tool.riskLevel).toBe("write");
    expect(tool.requiresConfirmation).toBe(false);
  });

  it("inserts an alert scoped to the calling user and conversation", async () => {
    const insertCalls: unknown[] = [];
    const client = {
      from: () => ({
        insert: (values: unknown) => {
          insertCalls.push(values);
          return {
            select: () => ({ single: async () => ({ data: { id: "alert-1" }, error: null }) }),
          };
        },
      }),
    } as unknown as SupabaseClient;
    const tool = createSetPriceAlertTool(client);

    const result = await tool.execute(
      { coinId: "bitcoin", vsCurrency: "usd", direction: "above", targetPrice: 100000 },
      { userId: "user-1", conversationId: "conv-1" },
    );

    expect(insertCalls).toEqual([
      {
        user_id: "user-1",
        conversation_id: "conv-1",
        coin_id: "bitcoin",
        vs_currency: "usd",
        direction: "above",
        target_price: 100000,
      },
    ]);
    expect(result).toEqual({
      success: true,
      data: {
        id: "alert-1",
        coinId: "bitcoin",
        vsCurrency: "usd",
        direction: "above",
        targetPrice: 100000,
      },
    });
  });
});

describe("createListPriceAlertsTool", () => {
  it("is a read tool that never requires confirmation", () => {
    const tool = createListPriceAlertsTool({} as SupabaseClient);
    expect(tool.riskLevel).toBe("read");
    expect(tool.requiresConfirmation).toBe(false);
  });

  it("lists only the calling user's pending alerts", async () => {
    const eqCalls: unknown[] = [];
    const client = {
      from: () => ({
        select: () => ({
          eq: (column: string, value: unknown) => {
            eqCalls.push([column, value]);
            return {
              eq: (column2: string, value2: unknown) => {
                eqCalls.push([column2, value2]);
                return {
                  order: async () => ({
                    data: [
                      {
                        id: "alert-1",
                        coin_id: "bitcoin",
                        vs_currency: "usd",
                        direction: "above",
                        target_price: 100000,
                      },
                    ],
                    error: null,
                  }),
                };
              },
            };
          },
        }),
      }),
    } as unknown as SupabaseClient;
    const tool = createListPriceAlertsTool(client);

    const result = await tool.execute({}, { userId: "user-1", conversationId: "conv-1" });

    expect(eqCalls).toEqual([
      ["user_id", "user-1"],
      ["status", "pending"],
    ]);
    expect(result.success).toBe(true);
  });
});

describe("createCancelPriceAlertTool", () => {
  it("is a write tool that requires confirmation", () => {
    const tool = createCancelPriceAlertTool({} as SupabaseClient);
    expect(tool.riskLevel).toBe("write");
    expect(tool.requiresConfirmation).toBe(true);
  });

  it("cancels only the calling user's pending alert with the given id", async () => {
    const eqCalls: unknown[] = [];
    const client = {
      from: () => ({
        update: () => ({
          eq: (column: string, value: unknown) => {
            eqCalls.push([column, value]);
            return {
              eq: (column2: string, value2: unknown) => {
                eqCalls.push([column2, value2]);
                return {
                  eq: (column3: string, value3: unknown) => {
                    eqCalls.push([column3, value3]);
                    return { error: null };
                  },
                };
              },
            };
          },
        }),
      }),
    } as unknown as SupabaseClient;
    const tool = createCancelPriceAlertTool(client);

    const result = await tool.execute(
      { alertId: "alert-1" },
      { userId: "user-1", conversationId: "conv-1" },
    );

    expect(eqCalls).toEqual([
      ["id", "alert-1"],
      ["user_id", "user-1"],
      ["status", "pending"],
    ]);
    expect(result).toEqual({ success: true, data: { cancelled: "alert-1" } });
  });
});
