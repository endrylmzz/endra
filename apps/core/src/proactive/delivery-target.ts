// Shared by memory-hygiene.ts, morning-digest.ts, ambient-watch.ts -
// all three are per-user periodic checks with no natural "which
// conversation" of their own (unlike reminders/price/weather alerts,
// each already scoped to a conversation_id from their own row). Picks
// the user's most recently active conversation - reasonable given
// ENDRA is single-user, single-primary-channel (Telegram) today.

import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseClient } from "../db/supabase-client.js";

export interface DeliveryTarget {
  channel: string;
  externalConversationId: string;
}

export async function findDeliveryTarget(
  userId: string,
  client: SupabaseClient = getSupabaseClient(),
): Promise<DeliveryTarget | undefined> {
  const { data, error } = await client
    .from("conversations")
    .select("channel, external_conversation_id")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) return undefined;
  return { channel: data.channel as string, externalConversationId: data.external_conversation_id as string };
}
