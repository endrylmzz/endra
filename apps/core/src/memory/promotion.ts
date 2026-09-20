// MEMORY-007: promotion pipeline. Not every conversation turn becomes
// long-term memory (CLAUDE.md section 23) - an LLM call decides what,
// if anything, from one exchange is worth remembering, then duplicates
// are filtered out before storing. Fire-and-forget from the caller's
// perspective (see message-service.ts) - never blocks the user's reply.

import type { LLMProvider } from "@endra/agent-contracts";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseClient } from "../db/supabase-client.js";
import { embedText } from "./embeddings.js";
import {
  saveMemory,
  findSimilarMemory,
  findRelatedMemories,
  type MemoryCandidate,
} from "./semantic-memory.js";
import { getPreference, setPreference } from "./preferences.js";
import { findOrCreateEntity, linkMemoryToEntity, type EntityType } from "./entities.js";
import { OpenAIProvider } from "../llm/openai-provider.js";

const ENTITY_TYPES = ["person", "place", "project", "organization", "other"] as const;

const EXTRACTION_SYSTEM_PROMPT = `You extract long-term memory candidates from a single conversation exchange for ENDRA, a personal AI assistant. Only extract facts, preferences, decisions, or ongoing projects worth remembering across future conversations - not small talk, greetings, or one-off questions with no lasting relevance.

For each candidate, also list the named entities (people, places, projects, organizations) it mentions - this builds a structured index the assistant can later query ("what have we discussed about X").

Respond with ONLY a JSON array (no prose, no markdown fences). Each item: {"type": "semantic"|"episodic"|"project"|"decision"|"task", "content": string, "importance": number between 0 and 1, "entities": [{"name": string, "type": "person"|"place"|"project"|"organization"|"other"}]}. "entities" may be an empty array. If nothing is worth remembering, respond with exactly [].`;

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
    return parsed.filter(isValidCandidate).map((candidate) => ({
      ...candidate,
      entities: sanitizeEntities(candidate.entities),
    }));
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

function isValidEntityType(value: unknown): value is EntityType {
  return typeof value === "string" && (ENTITY_TYPES as readonly string[]).includes(value);
}

// The core candidate (type/content/importance) is rejected wholesale if
// malformed - entities are supplementary, so a malformed entry there
// is just dropped rather than losing the whole memory over it.
function sanitizeEntities(value: unknown): { name: string; type: EntityType }[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (e): e is { name: string; type: EntityType } =>
      typeof e === "object" &&
      e !== null &&
      typeof (e as Record<string, unknown>).name === "string" &&
      isValidEntityType((e as Record<string, unknown>).type),
  );
}

// MEMORY-008: proactive memory connections. Not every related pair of
// memories is worth mentioning - an LLM call judges whether there's a
// genuine connection or contradiction, not just topical overlap.
const CONNECTION_JUDGE_SYSTEM_PROMPT = `Sen ENDRA'sın. Kullanıcı için az önce yeni bir hafıza kaydedildi. Aşağıda bu yeni hafızayla anlamsal olarak ilişkili, daha önce kaydedilmiş eski hafızalar var.

Görevin: bu yeni bilgiyle eskiler arasında kullanıcıya bahsetmeye değecek, gerçek bir bağlantı ya da çelişki olup olmadığına karar vermek. Sadece yüzeysel konu benzerliği yeterli değil - ilginç bir örtüşme, bir çelişki, bir gelişme/değişiklik ya da kullanıcının fark etmemiş olabileceği bir ilişki olmalı.

Yanıtını SADECE şu JSON formatında ver, başka hiçbir şey yazma: {"hasConnection": boolean, "insight": string}. hasConnection true ise insight, bu bağlantıyı kullanıcıya doğal, kısa bir Türkçe cümleyle anlatsın. false ise insight boş string olsun.`;

let defaultProvider: OpenAIProvider | undefined;
function getDefaultProvider(): OpenAIProvider {
  defaultProvider ??= new OpenAIProvider();
  return defaultProvider;
}

export async function judgeMemoryConnection(
  llm: LLMProvider,
  newMemoryContent: string,
  related: { content: string }[],
): Promise<{ hasConnection: boolean; insight: string }> {
  if (related.length === 0) return { hasConnection: false, insight: "" };

  const response = await llm.generate({
    systemPrompt: CONNECTION_JUDGE_SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `Yeni hafıza: "${newMemoryContent}"\n\nİlişkili eski hafızalar:\n${related
          .map((m) => `- "${m.content}"`)
          .join("\n")}`,
      },
    ],
  });
  try {
    const parsed = JSON.parse(response.content) as { hasConnection?: unknown; insight?: unknown };
    return {
      hasConnection: parsed.hasConnection === true,
      insight: typeof parsed.insight === "string" ? parsed.insight : "",
    };
  } catch {
    return { hasConnection: false, insight: "" };
  }
}

const PENDING_INSIGHTS_KEY = "pending_memory_insights";
const MAX_PENDING_INSIGHTS = 3;

// Queued for the next system-prompt build (see message-service.ts) since
// this runs after the reply is already sent - there's no "this turn" to
// mention it in. Consumed at most once; if ENDRA doesn't work it into
// the next reply naturally, it's dropped rather than retried - these are
// occasional nice-to-haves, not something that needs guaranteed delivery
// like an open decision.
async function queueMemoryInsight(
  userId: string,
  insight: string,
  client: SupabaseClient,
): Promise<void> {
  const existing = await getPreference(userId, PENDING_INSIGHTS_KEY, client);
  const pending = Array.isArray(existing) ? (existing as string[]) : [];
  const updated = [...pending, insight].slice(-MAX_PENDING_INSIGHTS);
  await setPreference(userId, PENDING_INSIGHTS_KEY, updated, client);
}

export async function promoteMemories(
  userId: string,
  candidates: MemoryCandidate[],
  client: SupabaseClient = getSupabaseClient(),
  embed: typeof embedText = embedText,
  llm?: LLMProvider,
): Promise<void> {
  for (const candidate of candidates) {
    const duplicate = await findSimilarMemory(userId, candidate.content, client, embed);
    if (duplicate) continue;
    const savedId = await saveMemory(userId, candidate, client, embed);

    if (candidate.entities && candidate.entities.length > 0) {
      try {
        for (const entity of candidate.entities) {
          const entityId = await findOrCreateEntity(userId, entity.name, entity.type, client);
          await linkMemoryToEntity(savedId, entityId, client);
        }
      } catch (err) {
        console.error("Entity linking failed:", err);
      }
    }

    try {
      const related = await findRelatedMemories(userId, candidate.content, savedId, client, embed);
      if (related.length === 0) continue;
      const judgment = await judgeMemoryConnection(
        llm ?? getDefaultProvider(),
        candidate.content,
        related,
      );
      if (judgment.hasConnection && judgment.insight) {
        await queueMemoryInsight(userId, judgment.insight, client);
      }
    } catch (err) {
      console.error("Memory connection check failed:", err);
    }
  }
}
