// Core's actual message pipeline: resolve identity -> load history ->
// call the LLM with ENDRA's persona -> persist both sides -> log the
// run. Kept out of the route file (routes/message.ts) so it can grow
// without touching the HTTP layer.

import type {
  EndraMessageRequest,
  EndraMessageResponseData,
  LLMProvider,
} from "@endra/agent-contracts";
import { resolveIdentity } from "../identity/resolve-identity.js";
import { getRecentMessages, saveMessage } from "../memory/messages.js";
import { loadPersona } from "../persona/load-persona.js";
import { logAgentRun } from "../observability/agent-run-log.js";
import { OpenAIProvider } from "../llm/openai-provider.js";

export interface MessageServiceDeps {
  resolveIdentity: typeof resolveIdentity;
  getRecentMessages: typeof getRecentMessages;
  saveMessage: typeof saveMessage;
  loadPersona: typeof loadPersona;
  logAgentRun: typeof logAgentRun;
  llmProvider: LLMProvider;
}

let defaultProvider: OpenAIProvider | undefined;
function getDefaultProvider(): OpenAIProvider {
  defaultProvider ??= new OpenAIProvider();
  return defaultProvider;
}

export async function handleMessage(
  request: EndraMessageRequest,
  deps: Partial<MessageServiceDeps> = {},
): Promise<EndraMessageResponseData> {
  const resolveIdentityFn = deps.resolveIdentity ?? resolveIdentity;
  const getRecentMessagesFn = deps.getRecentMessages ?? getRecentMessages;
  const saveMessageFn = deps.saveMessage ?? saveMessage;
  const loadPersonaFn = deps.loadPersona ?? loadPersona;
  const logAgentRunFn = deps.logAgentRun ?? logAgentRun;
  const llm = deps.llmProvider ?? getDefaultProvider();

  const { userId, conversationId } = await resolveIdentityFn({
    channel: request.channel,
    externalUserId: request.userId,
    externalConversationId: request.conversationId,
  });

  const history = await getRecentMessagesFn(conversationId);
  await saveMessageFn(conversationId, { role: "user", content: request.message });

  const startedAt = Date.now();
  try {
    const result = await llm.generate({
      systemPrompt: loadPersonaFn(),
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
