// PROACTIVE-003: the concrete, key-free conditional monitor - a
// one-shot crypto price alert (same free CoinGecko endpoint as
// get_crypto_price). Weather-based conditions wait on TOOLS-001.
// PROACTIVE-005 (dedup/cooldown): satisfied by design - a triggered
// alert's status leaves "pending", so the next tick never re-checks or
// re-fires it. No separate cooldown timestamp needed.

import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseClient } from "../db/supabase-client.js";
import { deliverToTelegram } from "./deliver-telegram.js";

const COINGECKO_BASE = "https://api.coingecko.com/api/v3/simple/price";

export interface PendingPriceAlert {
  id: string;
  coinId: string;
  vsCurrency: string;
  direction: "above" | "below";
  targetPrice: number;
  channel: string;
  externalConversationId: string;
}

interface PendingPriceAlertRow {
  id: string;
  coin_id: string;
  vs_currency: string;
  direction: "above" | "below";
  target_price: number;
  conversations: { channel: string; external_conversation_id: string };
}

export async function findPendingPriceAlerts(
  client: SupabaseClient = getSupabaseClient(),
): Promise<PendingPriceAlert[]> {
  const { data, error } = await client
    .from("price_alerts")
    .select(
      "id, coin_id, vs_currency, direction, target_price, conversations!inner(channel, external_conversation_id)",
    )
    .eq("status", "pending");
  if (error) throw error;

  return ((data ?? []) as unknown as PendingPriceAlertRow[]).map((row) => ({
    id: row.id,
    coinId: row.coin_id,
    vsCurrency: row.vs_currency,
    direction: row.direction,
    targetPrice: row.target_price,
    channel: row.conversations.channel,
    externalConversationId: row.conversations.external_conversation_id,
  }));
}

export async function markPriceAlertTriggered(
  id: string,
  client: SupabaseClient = getSupabaseClient(),
): Promise<void> {
  const { error } = await client.from("price_alerts").update({ status: "triggered" }).eq("id", id);
  if (error) throw error;
}

export async function fetchCryptoPrice(coinId: string, vsCurrency: string): Promise<number> {
  const url = `${COINGECKO_BASE}?ids=${encodeURIComponent(coinId)}&vs_currencies=${encodeURIComponent(vsCurrency)}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`CoinGecko request failed: ${response.status}`);
  const data = (await response.json()) as Record<string, Record<string, number>>;
  const price = data[coinId]?.[vsCurrency];
  if (price === undefined) throw new Error(`No price found for ${coinId}/${vsCurrency}`);
  return price;
}

function isTriggered(alert: PendingPriceAlert, price: number): boolean {
  return alert.direction === "above" ? price >= alert.targetPrice : price <= alert.targetPrice;
}

export async function checkPriceAlerts(
  client: SupabaseClient = getSupabaseClient(),
  fetchPrice: typeof fetchCryptoPrice = fetchCryptoPrice,
  deliver: typeof deliverToTelegram = deliverToTelegram,
): Promise<void> {
  const alerts = await findPendingPriceAlerts(client);

  for (const alert of alerts) {
    if (alert.channel !== "telegram") {
      console.error(
        `No delivery path for channel "${alert.channel}" - skipping price alert ${alert.id}`,
      );
      continue;
    }
    try {
      const price = await fetchPrice(alert.coinId, alert.vsCurrency);
      if (!isTriggered(alert, price)) continue;

      const direction = alert.direction === "above" ? "üzerine çıktı" : "altına düştü";
      await deliver(
        alert.externalConversationId,
        `${alert.coinId} fiyatı ${alert.targetPrice} ${alert.vsCurrency} ${direction}: şu an ${price} ${alert.vsCurrency}.`,
      );
      await markPriceAlertTriggered(alert.id, client);
    } catch (err) {
      console.error("Failed to check/deliver price alert", alert.id, err);
    }
  }
}
