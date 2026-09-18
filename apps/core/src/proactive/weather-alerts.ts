// Completes PROACTIVE-003 alongside price-alerts.ts - same shape,
// different data source. Dedup/cooldown (PROACTIVE-005) works the
// same way: a triggered/cancelled alert's status excludes it from the
// next tick, no separate mechanism needed.

import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseClient } from "../db/supabase-client.js";
import { fetchCurrentWeather, isPrecipitating } from "../weather/open-meteo.js";
import { deliverToTelegram } from "./deliver-telegram.js";

export interface PendingWeatherAlert {
  id: string;
  city: string;
  kind: "temperature" | "precipitation";
  direction: "above" | "below" | null;
  targetTemperatureC: number | null;
  channel: string;
  externalConversationId: string;
}

interface PendingWeatherAlertRow {
  id: string;
  city: string;
  kind: "temperature" | "precipitation";
  direction: "above" | "below" | null;
  target_temperature_c: number | null;
  conversations: { channel: string; external_conversation_id: string };
}

export async function findPendingWeatherAlerts(
  client: SupabaseClient = getSupabaseClient(),
): Promise<PendingWeatherAlert[]> {
  const { data, error } = await client
    .from("weather_alerts")
    .select(
      "id, city, kind, direction, target_temperature_c, conversations!inner(channel, external_conversation_id)",
    )
    .eq("status", "pending");
  if (error) throw error;

  return ((data ?? []) as unknown as PendingWeatherAlertRow[]).map((row) => ({
    id: row.id,
    city: row.city,
    kind: row.kind,
    direction: row.direction,
    targetTemperatureC: row.target_temperature_c,
    channel: row.conversations.channel,
    externalConversationId: row.conversations.external_conversation_id,
  }));
}

export async function markWeatherAlertTriggered(
  id: string,
  client: SupabaseClient = getSupabaseClient(),
): Promise<void> {
  const { error } = await client
    .from("weather_alerts")
    .update({ status: "triggered" })
    .eq("id", id);
  if (error) throw error;
}

function evaluateTrigger(
  alert: PendingWeatherAlert,
  weather: { temperatureC: number; weatherCode: number },
): boolean {
  if (alert.kind === "precipitation") return isPrecipitating(weather.weatherCode);
  // kind === "temperature" - direction/targetTemperatureC are guaranteed
  // present by set_weather_alert's own validation.
  return alert.direction === "above"
    ? weather.temperatureC >= (alert.targetTemperatureC ?? Infinity)
    : weather.temperatureC <= (alert.targetTemperatureC ?? -Infinity);
}

export async function checkWeatherAlerts(
  client: SupabaseClient = getSupabaseClient(),
  fetchWeather: typeof fetchCurrentWeather = fetchCurrentWeather,
  deliver: typeof deliverToTelegram = deliverToTelegram,
): Promise<void> {
  const alerts = await findPendingWeatherAlerts(client);

  for (const alert of alerts) {
    if (alert.channel !== "telegram") {
      console.error(
        `No delivery path for channel "${alert.channel}" - skipping weather alert ${alert.id}`,
      );
      continue;
    }
    try {
      const weather = await fetchWeather(alert.city);
      if (!evaluateTrigger(alert, weather)) continue;

      const message =
        alert.kind === "precipitation"
          ? `${alert.city}'de ${weather.condition} başladı.`
          : `${alert.city}'de sıcaklık ${alert.targetTemperatureC}°C ${alert.direction === "above" ? "üzerine çıktı" : "altına düştü"}: şu an ${weather.temperatureC}°C.`;
      await deliver(alert.externalConversationId, message);
      await markWeatherAlertTriggered(alert.id, client);
    } catch (err) {
      console.error("Failed to check/deliver weather alert", alert.id, err);
    }
  }
}
