import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  checkPriceAlerts,
  findPendingPriceAlerts,
  markPriceAlertTriggered,
} from "./price-alerts.js";

function alertRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "alert-1",
    coin_id: "bitcoin",
    vs_currency: "usd",
    direction: "above",
    target_price: 100000,
    conversations: { channel: "telegram", external_conversation_id: "42" },
    ...overrides,
  };
}

describe("findPendingPriceAlerts", () => {
  it("maps pending alerts joined with their conversation's channel/external id", async () => {
    const client = {
      from: () => ({
        select: () => ({ eq: async () => ({ data: [alertRow()], error: null }) }),
      }),
    } as unknown as SupabaseClient;

    const result = await findPendingPriceAlerts(client);

    expect(result).toEqual([
      {
        id: "alert-1",
        coinId: "bitcoin",
        vsCurrency: "usd",
        direction: "above",
        targetPrice: 100000,
        channel: "telegram",
        externalConversationId: "42",
      },
    ]);
  });
});

describe("markPriceAlertTriggered", () => {
  it("sets status to triggered by id", async () => {
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

    await markPriceAlertTriggered("alert-1", client);

    expect(eqCalls).toEqual([[{ status: "triggered" }, "id", "alert-1"]]);
  });
});

describe("checkPriceAlerts", () => {
  it("delivers and marks triggered when the price has crossed above the target", async () => {
    const updates: unknown[] = [];
    const client = {
      from: () => ({
        select: () => ({ eq: async () => ({ data: [alertRow()], error: null }) }),
        update: (values: unknown) => ({
          eq: (column: string, value: unknown) => {
            updates.push({ values, column, value });
            return { error: null };
          },
        }),
      }),
    } as unknown as SupabaseClient;
    const fetchPrice = vi.fn().mockResolvedValue(101_000);
    const deliver = vi.fn().mockResolvedValue(undefined);

    await checkPriceAlerts(client, fetchPrice, deliver);

    expect(fetchPrice).toHaveBeenCalledWith("bitcoin", "usd");
    expect(deliver).toHaveBeenCalledWith("42", expect.stringContaining("bitcoin"));
    expect(updates).toEqual([{ values: { status: "triggered" }, column: "id", value: "alert-1" }]);
  });

  it("does nothing when the target has not been crossed yet", async () => {
    const client = {
      from: () => ({
        select: () => ({ eq: async () => ({ data: [alertRow()], error: null }) }),
        update: () => ({ eq: () => ({ error: null }) }),
      }),
    } as unknown as SupabaseClient;
    const fetchPrice = vi.fn().mockResolvedValue(90_000);
    const deliver = vi.fn();

    await checkPriceAlerts(client, fetchPrice, deliver);

    expect(deliver).not.toHaveBeenCalled();
  });

  it("triggers a 'below' alert once the price has dropped to or under the target", async () => {
    const client = {
      from: () => ({
        select: () => ({
          eq: async () => ({
            data: [alertRow({ direction: "below", target_price: 50000 })],
            error: null,
          }),
        }),
        update: () => ({ eq: () => ({ error: null }) }),
      }),
    } as unknown as SupabaseClient;
    const fetchPrice = vi.fn().mockResolvedValue(49_000);
    const deliver = vi.fn().mockResolvedValue(undefined);

    await checkPriceAlerts(client, fetchPrice, deliver);

    expect(deliver).toHaveBeenCalledWith("42", expect.stringContaining("altına düştü"));
  });

  it("logs and continues when fetching the price fails, without throwing", async () => {
    const client = {
      from: () => ({
        select: () => ({ eq: async () => ({ data: [alertRow()], error: null }) }),
        update: () => ({ eq: () => ({ error: null }) }),
      }),
    } as unknown as SupabaseClient;
    const fetchPrice = vi.fn().mockRejectedValue(new Error("coingecko down"));
    const deliver = vi.fn();

    await expect(checkPriceAlerts(client, fetchPrice, deliver)).resolves.toBeUndefined();
    expect(deliver).not.toHaveBeenCalled();
  });
});
