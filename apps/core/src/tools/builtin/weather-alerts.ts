import type { EndraTool } from "@endra/agent-contracts";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseClient } from "../../db/supabase-client.js";

// write-risk, no confirmation - mirrors set_price_alert's reasoning:
// low-stakes, easily cancelled.
export function createSetWeatherAlertTool(client: SupabaseClient = getSupabaseClient()): EndraTool {
  return {
    name: "set_weather_alert",
    description:
      'Sets a one-time weather alert for a city (Open-Meteo, no API key). kind "temperature" needs direction+targetTemperatureC (e.g. "sıcaklık 30 üzerine çıkarsa"); kind "precipitation" fires once rain/snow/a storm starts (e.g. "yağmur başlarsa") - no other fields needed for it.',
    category: "information",
    riskLevel: "write",
    requiresConfirmation: false,
    inputSchema: {
      type: "object",
      required: ["city", "kind"],
      properties: {
        city: { type: "string", description: 'e.g. "Istanbul"' },
        kind: { type: "string", enum: ["temperature", "precipitation"] },
        direction: { type: "string", enum: ["above", "below"] },
        targetTemperatureC: { type: "number" },
      },
      additionalProperties: false,
    },
    async execute(input, context) {
      const { city, kind, direction, targetTemperatureC } = input as {
        city: string;
        kind: "temperature" | "precipitation";
        direction?: "above" | "below";
        targetTemperatureC?: number;
      };
      if (kind === "temperature" && (direction === undefined || targetTemperatureC === undefined)) {
        return {
          success: false,
          error: 'kind "temperature" için direction ve targetTemperatureC gerekli',
        };
      }

      const { data, error } = await client
        .from("weather_alerts")
        .insert({
          user_id: context.userId,
          conversation_id: context.conversationId,
          city,
          kind,
          ...(kind === "temperature"
            ? { direction, target_temperature_c: targetTemperatureC }
            : {}),
        })
        .select("id")
        .single();
      if (error) return { success: false, error: error.message };
      return {
        success: true,
        data: { id: data.id as string, city, kind, direction, targetTemperatureC },
      };
    },
  };
}

// read-risk, no confirmation - shows the user's own pending weather alerts.
export function createListWeatherAlertsTool(
  client: SupabaseClient = getSupabaseClient(),
): EndraTool {
  return {
    name: "list_weather_alerts",
    description: "Lists the user's pending (not yet triggered or cancelled) weather alerts.",
    category: "information",
    riskLevel: "read",
    requiresConfirmation: false,
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    async execute(_input, context) {
      const { data, error } = await client
        .from("weather_alerts")
        .select("id, city, kind, direction, target_temperature_c")
        .eq("user_id", context.userId)
        .eq("status", "pending")
        .order("created_at", { ascending: true });
      if (error) return { success: false, error: error.message };
      return { success: true, data };
    },
  };
}

// write-risk, requires confirmation - mirrors cancel_price_alert.
export function createCancelWeatherAlertTool(
  client: SupabaseClient = getSupabaseClient(),
): EndraTool {
  return {
    name: "cancel_weather_alert",
    description:
      "Cancels a pending weather alert by id (use list_weather_alerts first to find it).",
    category: "information",
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
        .from("weather_alerts")
        .update({ status: "cancelled" })
        .eq("id", alertId)
        .eq("user_id", context.userId)
        .eq("status", "pending");
      if (error) return { success: false, error: error.message };
      return { success: true, data: { cancelled: alertId } };
    },
  };
}
