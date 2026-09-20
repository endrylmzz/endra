// MEMORY-009: structured entity tracking. Entities are found-or-created
// per user by a normalized (trimmed, lowercased) name, so the same
// entity mentioned across many memories resolves to one row instead of
// duplicating.

import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseClient } from "../db/supabase-client.js";

export type EntityType = "person" | "place" | "project" | "organization" | "other";

export interface Entity {
  id: string;
  name: string;
  type: EntityType;
}

// Turkish-locale lowercasing, not the default: plain toLowerCase() maps
// "İ" to "i̇" (with a combining dot), which wouldn't match the plain
// "izmir" a later mention might use - toLocaleLowerCase("tr") maps both
// "İzmir" and "izmir" to the same "izmir".
function normalizeName(name: string): string {
  return name.trim().toLocaleLowerCase("tr");
}

export async function findOrCreateEntity(
  userId: string,
  name: string,
  type: EntityType,
  client: SupabaseClient = getSupabaseClient(),
): Promise<string> {
  const { data, error } = await client
    .from("entities")
    .upsert(
      { user_id: userId, name, normalized_name: normalizeName(name), type },
      { onConflict: "user_id,normalized_name" },
    )
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}

export async function linkMemoryToEntity(
  memoryId: string,
  entityId: string,
  client: SupabaseClient = getSupabaseClient(),
): Promise<void> {
  const { error } = await client
    .from("memory_entities")
    .upsert({ memory_id: memoryId, entity_id: entityId }, { onConflict: "memory_id,entity_id" });
  if (error) throw error;
}

export async function findEntityByName(
  userId: string,
  name: string,
  client: SupabaseClient = getSupabaseClient(),
): Promise<Entity | undefined> {
  const { data, error } = await client
    .from("entities")
    .select("id, name, type")
    .eq("user_id", userId)
    .eq("normalized_name", normalizeName(name))
    .maybeSingle();
  if (error) throw error;
  return (data as Entity | null) ?? undefined;
}

export async function listEntities(
  userId: string,
  client: SupabaseClient = getSupabaseClient(),
): Promise<Entity[]> {
  const { data, error } = await client
    .from("entities")
    .select("id, name, type")
    .eq("user_id", userId)
    .order("name", { ascending: true });
  if (error) throw error;
  return (data ?? []) as Entity[];
}

export interface EntityMemory {
  id: string;
  content: string;
}

export async function findMemoriesForEntity(
  entityId: string,
  client: SupabaseClient = getSupabaseClient(),
): Promise<EntityMemory[]> {
  const { data, error } = await client
    .from("memory_entities")
    .select("memories(id, content)")
    .eq("entity_id", entityId);
  if (error) throw error;
  const rows = (data ?? []) as unknown as { memories: EntityMemory | null }[];
  return rows.map((row) => row.memories).filter((m): m is EntityMemory => m !== null);
}
