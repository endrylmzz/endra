import type { EndraTool } from "@endra/agent-contracts";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseClient } from "../../db/supabase-client.js";

// write-risk, no confirmation - same reasoning as set_reminder: creating
// an alert is low-stakes and easily undone with cancel_price_alert.
export function createSetPriceAlertTool(client: SupabaseClient = getSupabaseClient()): EndraTool {
  return {
    name: "set_price_alert",
    description:
      "Sets a one-time alert that ENDRA sends automatically once a cryptocurrency's price crosses a target (CoinGecko ids/currencies, e.g. bitcoin/usd). No API key needed.",
    category: "finance",
    riskLevel: "write",
    requiresConfirmation: false,
    inputSchema: {
      type: "object",
      required: ["coinId", "vsCurrency", "direction", "targetPrice"],
      properties: {
        coinId: { type: "string", description: 'CoinGecko id, e.g. "bitcoin"' },
        vsCurrency: { type: "string", description: 'e.g. "usd"' },
        direction: { type: "string", enum: ["above", "below"] },
        targetPrice: { type: "number" },
      },
      additionalProperties: false,
    },
    async execute(input, context) {
      const { coinId, vsCurrency, direction, targetPrice } = input as {
        coinId: string;
        vsCurrency: string;
        direction: "above" | "below";
        targetPrice: number;
      };
      const { data, error } = await client
        .from("price_alerts")
        .insert({
          user_id: context.userId,
          conversation_id: context.conversationId,
          coin_id: coinId,
          vs_currency: vsCurrency,
          direction,
          target_price: targetPrice,
        })
        .select("id")
        .single();
      if (error) return { success: false, error: error.message };
      return {
        success: true,
        data: { id: data.id as string, coinId, vsCurrency, direction, targetPrice },
      };
    },
  };
}

// read-risk, no confirmation - shows the user's own pending price alerts.
export function createListPriceAlertsTool(client: SupabaseClient = getSupabaseClient()): EndraTool {
  return {
    name: "list_price_alerts",
    description: "Lists the user's pending (not yet triggered or cancelled) price alerts.",
    category: "finance",
    riskLevel: "read",
    requiresConfirmation: false,
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    async execute(_input, context) {
      const { data, error } = await client
        .from("price_alerts")
        .select("id, coin_id, vs_currency, direction, target_price")
        .eq("user_id", context.userId)
        .eq("status", "pending")
        .order("created_at", { ascending: true });
      if (error) return { success: false, error: error.message };
      return { success: true, data };
    },
  };
}

// write-risk, requires confirmation - mirrors cancel_reminder's reasoning.
export function createCancelPriceAlertTool(
  client: SupabaseClient = getSupabaseClient(),
): EndraTool {
  return {
    name: "cancel_price_alert",
    description: "Cancels a pending price alert by id (use list_price_alerts first to find it).",
    category: "finance",
    riskLevel: "write",
    requiresConfirmation: true,
    inputSchema: {
      type: "object",
      required: ["alertId"],
      properties: { alertId: { type: "string" } },
      additionalProperties: false,
    },
    async execute(input, context) {
      const { alertId } = input as { alertId: string };
      const { error } = await client
        .from("price_alerts")
        .update({ status: "cancelled" })
        .eq("id", alertId)
        .eq("user_id", context.userId)
        .eq("status", "pending");
      if (error) return { success: false, error: error.message };
      return { success: true, data: { cancelled: alertId } };
    },
  };
}
