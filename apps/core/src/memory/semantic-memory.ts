// MEMORY-005/006: long-term semantic/episodic/project/decision/task
// memory, distinct from the raw conversation log in messages.ts.
// Retrieval fuses semantic similarity + keyword rank + importance +
// recency (search_memories SQL function - see the migration) rather
// than ranking on vector similarity alone.

import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseClient } from "../db/supabase-client.js";
import { embedText } from "./embeddings.js";

export type MemoryType = "semantic" | "episodic" | "project" | "decision" | "task";

export interface MemoryCandidate {
  type: MemoryType;
  content: string;
  importance: number;
}

export interface RankedMemory {
  id: string;
  content: string;
  type: MemoryType;
  importance: number;
  score: number;
}

export async function saveMemory(
  userId: string,
  memory: MemoryCandidate,
  client: SupabaseClient = getSupabaseClient(),
  embed: typeof embedText = embedText,
): Promise<string> {
  const embedding = await embed(memory.content);
  const { data, error } = await client
    .from("memories")
    .insert({
      user_id: userId,
      type: memory.type,
      content: memory.content,
      importance: memory.importance,
      embedding,
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}

const DUPLICATE_SIMILARITY_THRESHOLD = 0.92;

/** Pure cosine-similarity lookup, for MEMORY-007's duplicate detection. */
export async function findSimilarMemory(
  userId: string,
  content: string,
  client: SupabaseClient = getSupabaseClient(),
  embed: typeof embedText = embedText,
): Promise<{ id: string; similarity: number } | undefined> {
  const embedding = await embed(content);
  const { data, error } = await client.rpc("find_similar_memory", {
    p_user_id: userId,
    p_embedding: embedding,
    p_threshold: DUPLICATE_SIMILARITY_THRESHOLD,
  });
  if (error) throw error;
  return (data as { id: string; similarity: number }[] | null)?.[0];
}

export async function searchMemories(
  userId: string,
  query: string,
  limit = 10,
  client: SupabaseClient = getSupabaseClient(),
  embed: typeof embedText = embedText,
): Promise<RankedMemory[]> {
  const embedding = await embed(query);
  const { data, error } = await client.rpc("search_memories", {
    p_user_id: userId,
    p_query_embedding: embedding,
    p_query_text: query,
    p_limit: limit,
  });
  if (error) throw error;
  return (data ?? []) as RankedMemory[];
}
