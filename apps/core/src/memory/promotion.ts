// MEMORY-007: promotion pipeline. Not every conversation turn becomes
// long-term memory (CLAUDE.md section 23) - an LLM call decides what,
// if anything, from one exchange is worth remembering, then duplicates
// are filtered out before storing. Fire-and-forget from the caller's
// perspective (see message-service.ts) - never blocks the user's reply.

import type { LLMProvider } from "@endra/agent-contracts";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseClient } from "../db/supabase-client.js";
import { embedText } from "./embeddings.js";
import { saveMemory, findSimilarMemory, type MemoryCandidate } from "./semantic-memory.js";

const EXTRACTION_SYSTEM_PROMPT = `You extract long-term memory candidates from a single conversation exchange for ENDRA, a personal AI assistant. Only extract facts, preferences, decisions, or ongoing projects worth remembering across future conversations - not small talk, greetings, or one-off questions with no lasting relevance.

Respond with ONLY a JSON array (no prose, no markdown fences). Each item: {"type": "semantic"|"episodic"|"project"|"decision"|"task", "content": string, "importance": number between 0 and 1}. If nothing is worth remembering, respond with exactly [].`;

export async function extractMemoryCandidates(
  exchange: { userMessage: string; assistantMessage: string },
  llm: LLMProvider,
): Promise<MemoryCandidate[]> {
  const response = await llm.generate({
    systemPrompt: EXTRACTION_SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `User: ${exchange.userMessage}\nAssistant: ${exchange.assistantMessage}`,
      },
    ],
  });

  try {
    const parsed: unknown = JSON.parse(response.content);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isValidCandidate);
  } catch {
    return [];
  }
}

function isValidCandidate(value: unknown): value is MemoryCandidate {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.type === "string" &&
    typeof candidate.content === "string" &&
    typeof candidate.importance === "number"
  );
}

export async function promoteMemories(
  userId: string,
  candidates: MemoryCandidate[],
  client: SupabaseClient = getSupabaseClient(),
  embed: typeof embedText = embedText,
): Promise<void> {
  for (const candidate of candidates) {
    const duplicate = await findSimilarMemory(userId, candidate.content, client, embed);
    if (duplicate) continue;
    await saveMemory(userId, candidate, client, embed);
  }
}
