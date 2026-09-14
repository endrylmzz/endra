// MEMORY-003: persist and retrieve raw conversation messages. This is
// the working-memory layer (see CLAUDE.md section 21/7) - not the
// promoted long-term memory system (semantic/episodic/etc, MEMORY-005+).

import type { SupabaseClient } from "@supabase/supabase-js";
import type { LLMMessage } from "@endra/agent-contracts";
import { getSupabaseClient } from "../db/supabase-client.js";

const DEFAULT_HISTORY_LIMIT = 20;

export async function saveMessage(
  conversationId: string,
  message: LLMMessage,
  client: SupabaseClient = getSupabaseClient(),
): Promise<void> {
  const { error } = await client
    .from("messages")
    .insert({ conversation_id: conversationId, role: message.role, content: message.content });
  if (error) throw error;
}

export async function getRecentMessages(
  conversationId: string,
  limit: number = DEFAULT_HISTORY_LIMIT,
  client: SupabaseClient = getSupabaseClient(),
): Promise<LLMMessage[]> {
  const { data, error } = await client
    .from("messages")
    .select("role, content")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;

  return ((data ?? []) as LLMMessage[]).reverse();
}
