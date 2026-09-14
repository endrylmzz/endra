// Core's actual message pipeline: resolve identity -> load history and
// relevant long-term memory -> call the LLM with ENDRA's persona ->
// persist both sides -> log the run -> (in the background) extract and
// promote new long-term memories. Kept out of the route file
// (routes/message.ts) so it can grow without touching the HTTP layer.

import type {
  EndraMessageRequest,
  EndraMessageResponseData,
  LLMProvider,
} from "@endra/agent-contracts";
import { resolveIdentity } from "../identity/resolve-identity.js";
import { getRecentMessages, saveMessage } from "../memory/messages.js";
import { searchMemories, type RankedMemory } from "../memory/semantic-memory.js";
import { extractMemoryCandidates, promoteMemories } from "../memory/promotion.js";
import { loadPersona } from "../persona/load-persona.js";
import { logAgentRun } from "../observability/agent-run-log.js";
import { OpenAIProvider } from "../llm/openai-provider.js";

export interface MessageServiceDeps {
  resolveIdentity: typeof resolveIdentity;
  getRecentMessages: typeof getRecentMessages;
  saveMessage: typeof saveMessage;
  searchMemories: typeof searchMemories;
  extractMemoryCandidates: typeof extractMemoryCandidates;
  promoteMemories: typeof promoteMemories;
  loadPersona: typeof loadPersona;
  logAgentRun: typeof logAgentRun;
  llmProvider: LLMProvider;
}

let defaultProvider: OpenAIProvider | undefined;
function getDefaultProvider(): OpenAIProvider {
  defaultProvider ??= new OpenAIProvider();
  return defaultProvider;
}

function buildSystemPrompt(persona: string, memories: RankedMemory[]): string {
  if (memories.length === 0) return persona;
  const memoryBlock = memories.map((m) => `- ${m.content}`).join("\n");
  return `${persona}\n\nEnder hakkında hatırladığın bazı şeyler:\n${memoryBlock}`;
}

export async function handleMessage(
  request: EndraMessageRequest,
  deps: Partial<MessageServiceDeps> = {},
): Promise<EndraMessageResponseData> {
  const resolveIdentityFn = deps.resolveIdentity ?? resolveIdentity;
  const getRecentMessagesFn = deps.getRecentMessages ?? getRecentMessages;
  const saveMessageFn = deps.saveMessage ?? saveMessage;
  const searchMemoriesFn = deps.searchMemories ?? searchMemories;
  const extractMemoryCandidatesFn = deps.extractMemoryCandidates ?? extractMemoryCandidates;
  const promoteMemoriesFn = deps.promoteMemories ?? promoteMemories;
  const loadPersonaFn = deps.loadPersona ?? loadPersona;
  const logAgentRunFn = deps.logAgentRun ?? logAgentRun;
  const llm = deps.llmProvider ?? getDefaultProvider();

  const { userId, conversationId } = await resolveIdentityFn({
    channel: request.channel,
    externalUserId: request.userId,
    externalConversationId: request.conversationId,
  });

  const history = await getRecentMessagesFn(conversationId);
  // A fresh semantic-memory system has nothing to find yet, and a search
  // failure shouldn't break the reply - fall back to no memories.
  const relevantMemories = await searchMemoriesFn(userId, request.message).catch(() => []);
  await saveMessageFn(conversationId, { role: "user", content: request.message });

  const startedAt = Date.now();
  try {
    const result = await llm.generate({
      systemPrompt: buildSystemPrompt(loadPersonaFn(), relevantMemories),
      messages: [...history, { role: "user", content: request.message }],
    });

    await saveMessageFn(conversationId, { role: "assistant", content: result.content });
    await logAgentRunFn({
      conversationId,
      userId,
      provider: llm.name,
      model: result.model,
      status: "success",
      durationMs: Date.now() - startedAt,
      inputTokens: result.usage.inputTokens,
      outputTokens: result.usage.outputTokens,
    });

    // Fire-and-forget: deciding what's worth remembering long-term must
    // never delay or break the actual reply (CLAUDE.md section 23 - not
    // every turn becomes a memory, and this is a second LLM call).
    void extractMemoryCandidatesFn(
      { userMessage: request.message, assistantMessage: result.content },
      llm,
    )
      .then((candidates) => promoteMemoriesFn(userId, candidates))
      .catch((err: unknown) => {
        console.error("memory promotion failed:", err);
      });

    // The caller's own conversationId, not the internal Supabase id -
    // the response contract shouldn't leak storage details.
    return { message: result.content, conversationId: request.conversationId };
  } catch (err) {
    await logAgentRunFn({
      conversationId,
      userId,
      provider: llm.name,
      model: "unknown",
      status: "error",
      durationMs: Date.now() - startedAt,
      errorMessage: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}
