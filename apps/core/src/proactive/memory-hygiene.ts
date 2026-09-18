// Weekly, per-user: proactively resurface old, low-importance
// memories so they don't just accumulate forever unreviewed. Reuses
// the existing preferences store as the "when did we last run this"
// marker - no new table needed just for a timestamp - and the
// existing deliverToTelegram push, same as every other proactive
// check.

import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseClient } from "../db/supabase-client.js";
import { getPreference, setPreference } from "../memory/preferences.js";
import type { StoredMemory } from "../memory/semantic-memory.js";
import { deliverToTelegram } from "./deliver-telegram.js";

const HYGIENE_PREFERENCE_KEY = "memory_hygiene_last_run_at";
const HYGIENE_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;
const STALE_AGE_DAYS = 30;
const LOW_IMPORTANCE_THRESHOLD = 0.4;
const MAX_MEMORIES_PER_DIGEST = 5;

export async function findStaleMemories(
  userId: string,
  client: SupabaseClient = getSupabaseClient(),
): Promise<StoredMemory[]> {
  // list_memories's own filtering is by recency only - staleness here
  // needs both age and low importance, so this queries directly.
  const cutoff = new Date(Date.now() - STALE_AGE_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await client
    .from("memories")
    .select("id, content, type, importance, created_at")
    .eq("user_id", userId)
    .lt("importance", LOW_IMPORTANCE_THRESHOLD)
    .lt("created_at", cutoff)
    .order("importance", { ascending: true })
    .limit(MAX_MEMORIES_PER_DIGEST);
  if (error) throw error;
  return (
    (data ?? []) as {
      id: string;
      content: string;
      type: StoredMemory["type"];
      importance: number;
      created_at: string;
    }[]
  ).map((m) => ({
    id: m.id,
    content: m.content,
    type: m.type,
    importance: m.importance,
    createdAt: m.created_at,
  }));
}

interface DeliveryTarget {
  channel: string;
  externalConversationId: string;
}

async function findDeliveryTarget(
  userId: string,
  client: SupabaseClient,
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
  return {
    channel: data.channel as string,
    externalConversationId: data.external_conversation_id as string,
  };
}

function isDue(lastRunAt: unknown): boolean {
  if (typeof lastRunAt !== "string") return true;
  const lastRun = new Date(lastRunAt).getTime();
  return Number.isNaN(lastRun) || Date.now() - lastRun >= HYGIENE_INTERVAL_MS;
}

export async function checkMemoryHygiene(
  client: SupabaseClient = getSupabaseClient(),
  deliver: typeof deliverToTelegram = deliverToTelegram,
): Promise<void> {
  const { data: users, error } = await client.from("users").select("id");
  if (error) throw error;

  for (const user of (users ?? []) as { id: string }[]) {
    try {
      const lastRunAt = await getPreference(user.id, HYGIENE_PREFERENCE_KEY, client);
      if (!isDue(lastRunAt)) continue;

      const stale = await findStaleMemories(user.id, client);
      if (stale.length > 0) {
        const target = await findDeliveryTarget(user.id, client);
        if (target?.channel === "telegram") {
          const list = stale.map((m) => `- ${m.content}`).join("\n");
          await deliver(
            target.externalConversationId,
            `Hafızanda uzun süredir tazelenmemiş, önem derecesi düşük birkaç kayıt var:\n${list}\n\nBunları hâlâ tutmak mı istersin, yoksa silinsin mi? Söylemen yeterli.`,
          );
        }
      }
      await setPreference(user.id, HYGIENE_PREFERENCE_KEY, new Date().toISOString(), client);
    } catch (err) {
      console.error("Memory hygiene check failed for user", user.id, err);
    }
  }
}
