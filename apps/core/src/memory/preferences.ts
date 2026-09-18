// MEMORY-004: user preferences (CLAUDE.md section 21 "User Profile
// Memory") - a simple per-user key/value store, distinct from semantic
// memory.

import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseClient } from "../db/supabase-client.js";

export async function getPreference(
  userId: string,
  key: string,
  client: SupabaseClient = getSupabaseClient(),
): Promise<unknown> {
  const { data, error } = await client
    .from("preferences")
    .select("value")
    .eq("user_id", userId)
    .eq("key", key)
    .maybeSingle();
  if (error) throw error;
  return data?.value;
}

export async function setPreference(
  userId: string,
  key: string,
  value: unknown,
  client: SupabaseClient = getSupabaseClient(),
): Promise<void> {
  const { error } = await client
    .from("preferences")
    .upsert({ user_id: userId, key, value }, { onConflict: "user_id,key" });
  if (error) throw error;
}

export interface PreferenceRecord {
  key: string;
  value: unknown;
}

export async function listPreferences(
  userId: string,
  client: SupabaseClient = getSupabaseClient(),
): Promise<PreferenceRecord[]> {
  const { data, error } = await client
    .from("preferences")
    .select("key, value")
    .eq("user_id", userId);
  if (error) throw error;
  return (data ?? []) as PreferenceRecord[];
}

export async function deletePreference(
  userId: string,
  key: string,
  client: SupabaseClient = getSupabaseClient(),
): Promise<void> {
  const { error } = await client.from("preferences").delete().eq("user_id", userId).eq("key", key);
  if (error) throw error;
}
