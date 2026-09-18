// Core's actual message pipeline: resolve identity -> transcribe/attach
// any voice note or photo -> check for a pending tool confirmation ->
// load history and relevant long-term memory -> call the LLM (with
// tools and vision) with ENDRA's persona -> run any requested tools,
// looping until a final text reply -> persist both sides -> log the
// run -> (in the background) extract and promote new long-term
// memories. Kept out of the route file (routes/message.ts) so it can
// grow without touching the HTTP layer.
//
// Confirmation prompts and wrap-up replies are phrased by the LLM
// itself (one extra text-only generate() call, no tools), not built as
// canned strings - ENDRA's persona should sound the same whether it's
// answering a question or asking for approval. This never changes the
// actual safety guarantee: a tool only ever executes via
// ToolRouter.confirm() with the exact arguments stored at approval
// time, regardless of how the LLM phrases anything.

import type {
  EndraAttachment,
  EndraMessageRequest,
  EndraMessageResponseData,
  LLMMessage,
  LLMProvider,
  LLMToolDefinition,
} from "@endra/agent-contracts";
import { resolveIdentity } from "../identity/resolve-identity.js";
import { getRecentMessages, saveMessage } from "../memory/messages.js";
import { searchMemories, type RankedMemory } from "../memory/semantic-memory.js";
import { listPreferences, type PreferenceRecord } from "../memory/preferences.js";
import { listOpenDecisions, type OpenDecision } from "../tools/builtin/decisions.js";
import { extractMemoryCandidates, promoteMemories } from "../memory/promotion.js";
import { loadPersona } from "../persona/load-persona.js";
import { logAgentRun } from "../observability/agent-run-log.js";
import { OpenAIProvider } from "../llm/openai-provider.js";
import { transcribeAudio } from "../media/transcription.js";
import { synthesizeSpeech } from "../media/speech.js";
import type { ToolRegistry } from "../tools/registry.js";
import type { ToolRouter } from "../tools/router.js";
import { getDefaultToolRegistry, getDefaultToolRouter } from "../tools/default-registry.js";
import { findPendingApproval, resolveApprovalStatus } from "../tools/approvals.js";
import { detectConfirmationIntent } from "../tools/confirmation-intent.js";

export interface MessageServiceDeps {
  resolveIdentity: typeof resolveIdentity;
  getRecentMessages: typeof getRecentMessages;
  saveMessage: typeof saveMessage;
  searchMemories: typeof searchMemories;
  listPreferences: typeof listPreferences;
  listOpenDecisions: typeof listOpenDecisions;
  extractMemoryCandidates: typeof extractMemoryCandidates;
  promoteMemories: typeof promoteMemories;
  loadPersona: typeof loadPersona;
  logAgentRun: typeof logAgentRun;
  transcribeAudio: typeof transcribeAudio;
  synthesizeSpeech: typeof synthesizeSpeech;
  llmProvider: LLMProvider;
  toolRegistry: ToolRegistry;
  toolRouter: ToolRouter;
  findPendingApproval: typeof findPendingApproval;
  resolveApprovalStatus: typeof resolveApprovalStatus;
}

let defaultProvider: OpenAIProvider | undefined;
function getDefaultProvider(): OpenAIProvider {
  defaultProvider ??= new OpenAIProvider();
  return defaultProvider;
}

function buildSystemPrompt(
  persona: string,
  memories: RankedMemory[],
  preferences: PreferenceRecord[],
  openDecisions: OpenDecision[],
  note?: string,
): string {
  const memoryBlock =
    memories.length > 0
      ? `\n\nEnder hakkında hatırladığın bazı şeyler:\n${memories.map((m) => `- ${m.content}`).join("\n")}`
      : "";
  const preferencesBlock =
    preferences.length > 0
      ? `\n\nEnder'in ayarladığı tercihler (bunlara uy):\n${preferences
          .map(
            (p) => `- ${p.key}: ${typeof p.value === "string" ? p.value : JSON.stringify(p.value)}`,
          )
          .join("\n")}`
      : "";
  const decisionsBlock =
    openDecisions.length > 0
      ? `\n\nEnder'in takip edilen açık kararları (biri bunlardan birine güncelleme/sonuç veriyorsa resolve_decision ile kapat, id'sini kullan):\n${openDecisions
          .map(
            (d) => `- [id: ${d.id}] ${d.decision}${d.reasoning ? ` (sebep: ${d.reasoning})` : ""}`,
          )
          .join("\n")}`
      : "";
  const noteBlock = note ? `\n\n${note}` : "";
  return `${persona}${memoryBlock}${preferencesBlock}${decisionsBlock}${noteBlock}`;
}

function isImageAttachment(value: unknown): value is EndraAttachment {
  const v = value as Record<string, unknown> | null;
  return (
    typeof v === "object" &&
    v !== null &&
    v.type === "image" &&
    typeof v.data === "string" &&
    typeof v.mimeType === "string"
  );
}

const MAX_TOOL_ITERATIONS = 4;

export async function handleMessage(
  request: EndraMessageRequest,
  deps: Partial<MessageServiceDeps> = {},
): Promise<EndraMessageResponseData> {
  const resolveIdentityFn = deps.resolveIdentity ?? resolveIdentity;
  const getRecentMessagesFn = deps.getRecentMessages ?? getRecentMessages;
  const saveMessageFn = deps.saveMessage ?? saveMessage;
  const searchMemoriesFn = deps.searchMemories ?? searchMemories;
  const listPreferencesFn = deps.listPreferences ?? listPreferences;
  const listOpenDecisionsFn = deps.listOpenDecisions ?? listOpenDecisions;
  const extractMemoryCandidatesFn = deps.extractMemoryCandidates ?? extractMemoryCandidates;
  const promoteMemoriesFn = deps.promoteMemories ?? promoteMemories;
  const loadPersonaFn = deps.loadPersona ?? loadPersona;
  const logAgentRunFn = deps.logAgentRun ?? logAgentRun;
  const transcribeAudioFn = deps.transcribeAudio ?? transcribeAudio;
  const synthesizeSpeechFn = deps.synthesizeSpeech ?? synthesizeSpeech;
  const llm = deps.llmProvider ?? getDefaultProvider();
  const toolRegistry = deps.toolRegistry ?? getDefaultToolRegistry();
  const toolRouter = deps.toolRouter ?? getDefaultToolRouter();
  const findPendingApprovalFn = deps.findPendingApproval ?? findPendingApproval;
  const resolveApprovalStatusFn = deps.resolveApprovalStatus ?? resolveApprovalStatus;

  const { userId, conversationId } = await resolveIdentityFn({
    channel: request.channel,
    externalUserId: request.userId,
    externalConversationId: request.conversationId,
  });
  const toolContext = { userId, conversationId };
  const history = await getRecentMessagesFn(conversationId);
  const preferences = await listPreferencesFn(userId).catch(() => []);
  const openDecisions = await listOpenDecisionsFn(userId).catch(() => []);

  // A voice note becomes its transcribed text; a photo becomes vision
  // input on this turn's user message - neither changes anything else
  // in the pipeline below.
  let effectiveMessage = request.message;
  let imageUrls: string[] | undefined;
  let hadVoiceInput = false;
  for (const attachment of request.attachments ?? []) {
    if (attachment.type === "audio") {
      hadVoiceInput = true;
      const transcript = await transcribeAudioFn(attachment.data, attachment.mimeType);
      effectiveMessage = effectiveMessage ? `${effectiveMessage}\n${transcript}` : transcript;
    } else if (attachment.type === "image") {
      imageUrls = [...(imageUrls ?? []), `data:${attachment.mimeType};base64,${attachment.data}`];
    }
  }

  await saveMessageFn(conversationId, { role: "user", content: effectiveMessage });

  const startedAt = Date.now();

  // A voice note in gets a voice note back (VOICE-003) - mirrors this
  // turn's input modality rather than a user-facing toggle. Falls back
  // to text-only on any TTS failure instead of breaking the reply.
  async function synthesizeVoiceAttachments(text: string): Promise<EndraAttachment[]> {
    if (!hadVoiceInput) return [];
    try {
      const data = await synthesizeSpeechFn(text);
      return [{ type: "audio", data, mimeType: "audio/ogg" }];
    } catch (err) {
      console.error("Speech synthesis failed:", err);
      return [];
    }
  }

  async function replyNaturally(note: string): Promise<EndraMessageResponseData> {
    const result = await llm.generate({
      systemPrompt: buildSystemPrompt(loadPersonaFn(), [], preferences, openDecisions, note),
      messages: [...history, { role: "user", content: effectiveMessage }],
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
    const voiceAttachments = await synthesizeVoiceAttachments(result.content);
    return {
      message: result.content,
      conversationId: request.conversationId,
      ...(voiceAttachments.length > 0 ? { attachments: voiceAttachments } : {}),
    };
  }

  // If a tool is waiting on this conversation's approval, treat this
  // message as the answer to that instead of a fresh request.
  const pendingApproval = await findPendingApprovalFn(conversationId);
  if (pendingApproval) {
    const intent = detectConfirmationIntent(effectiveMessage);

    if (intent === "approve") {
      const result = await toolRouter.confirm(pendingApproval.id, toolContext);
      return replyNaturally(
        result.success
          ? `Kullanıcı "${pendingApproval.toolName}" işlemini onayladı ve başarıyla tamamlandı. Sonuç: ${JSON.stringify(result.data)}. Bunu kısa ve doğal bir dille bildir - JSON veya teknik detay gösterme.`
          : `Kullanıcı "${pendingApproval.toolName}" işlemini onayladı ama çalıştırırken bir hata oldu: ${result.error ?? "bilinmeyen hata"}. Bunu ona kısaca açıkla.`,
      );
    }

    if (intent === "reject") {
      await resolveApprovalStatusFn(pendingApproval.id, "rejected");
      return replyNaturally(
        `Kullanıcı "${pendingApproval.toolName}" işlemini iptal etti. Bunu kısaca onayla.`,
      );
    }

    // "unclear" - fall through to the normal flow; the pending approval
    // just sits there until confirmed, rejected, or it expires (5 min).
  }

  const relevantMemories = await searchMemoriesFn(userId, effectiveMessage).catch(() => []);
  const systemPrompt = buildSystemPrompt(
    loadPersonaFn(),
    relevantMemories,
    preferences,
    openDecisions,
  );
  const toolDefs: LLMToolDefinition[] = toolRegistry.list().map((tool) => ({
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema,
  }));

  const conversationMessages: LLMMessage[] = [
    ...history,
    { role: "user", content: effectiveMessage, ...(imageUrls ? { imageUrls } : {}) },
  ];
  const responseAttachments: EndraAttachment[] = [];

  try {
    let lastResult;

    for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
      lastResult = await llm.generate({
        systemPrompt,
        messages: conversationMessages,
        tools: toolDefs,
      });

      if (!lastResult.toolCalls || lastResult.toolCalls.length === 0) break;

      conversationMessages.push({
        role: "assistant",
        content: lastResult.content,
        toolCalls: lastResult.toolCalls,
      });

      let pendingConfirmation = false;
      for (const call of lastResult.toolCalls) {
        const outcome = await toolRouter.route(
          { name: call.name, arguments: call.arguments },
          toolContext,
        );
        if (outcome.type === "pending_confirmation") {
          pendingConfirmation = true;
          conversationMessages.push({
            role: "tool",
            toolCallId: call.id,
            content: JSON.stringify({
              success: false,
              requiresConfirmation: true,
              tool: call.name,
              arguments: call.arguments,
              message:
                "Bu işlem kullanıcının onayını gerektiriyor. Kullanıcıya doğal bir Türkçe cümleyle ne yapmak istediğini açıkla ve onay iste (evet/hayır şeklinde cevap vermesini iste). Bu turda çalıştırılmış başka bir tool sonucu varsa (yukarıdaki mesajlarda), onu da atlamadan aynı cevaba doğal bir şekilde dahil et - sadece onay isteğiyle sınırlı kalma. JSON gösterme.",
            }),
          });
        } else if (isImageAttachment(outcome.result.data)) {
          // Don't feed a huge base64 blob back into the model as text -
          // it's expensive and the model can't usefully "see" it that
          // way. Send the actual bytes straight to the user instead.
          responseAttachments.push(outcome.result.data);
          conversationMessages.push({
            role: "tool",
            toolCallId: call.id,
            content: JSON.stringify({
              success: outcome.result.success,
              message: "Görsel oluşturuldu ve kullanıcıya gönderiliyor.",
            }),
          });
        } else {
          conversationMessages.push({
            role: "tool",
            toolCallId: call.id,
            content: JSON.stringify(outcome.result),
          });
        }
      }

      if (pendingConfirmation) {
        // One more call, tools omitted on purpose - force a natural text
        // reply instead of another tool call while confirmation is open.
        const confirmationAsk = await llm.generate({
          systemPrompt,
          messages: conversationMessages,
        });
        await saveMessageFn(conversationId, {
          role: "assistant",
          content: confirmationAsk.content,
        });
        await logAgentRunFn({
          conversationId,
          userId,
          provider: llm.name,
          model: confirmationAsk.model,
          status: "success",
          durationMs: Date.now() - startedAt,
          inputTokens: confirmationAsk.usage.inputTokens,
          outputTokens: confirmationAsk.usage.outputTokens,
        });
        const voiceAttachments = await synthesizeVoiceAttachments(confirmationAsk.content);
        return {
          message: confirmationAsk.content,
          conversationId: request.conversationId,
          ...(voiceAttachments.length > 0 ? { attachments: voiceAttachments } : {}),
        };
      }
    }

    const replyContent = lastResult?.content || "Üzgünüm, bu isteği tamamlayamadım.";
    await saveMessageFn(conversationId, { role: "assistant", content: replyContent });
    await logAgentRunFn({
      conversationId,
      userId,
      provider: llm.name,
      model: lastResult?.model ?? "unknown",
      status: "success",
      durationMs: Date.now() - startedAt,
      inputTokens: lastResult?.usage.inputTokens ?? 0,
      outputTokens: lastResult?.usage.outputTokens ?? 0,
    });

    // Fire-and-forget: deciding what's worth remembering long-term must
    // never delay or break the actual reply (CLAUDE.md section 23 - not
    // every turn becomes a memory, and this is a second LLM call).
    void extractMemoryCandidatesFn(
      { userMessage: effectiveMessage, assistantMessage: replyContent },
      llm,
    )
      .then((candidates) => promoteMemoriesFn(userId, candidates))
      .catch((err: unknown) => {
        console.error("memory promotion failed:", err);
      });

    const voiceAttachments = await synthesizeVoiceAttachments(replyContent);
    const allAttachments = [...responseAttachments, ...voiceAttachments];

    // The caller's own conversationId, not the internal Supabase id -
    // the response contract shouldn't leak storage details.
    return {
      message: replyContent,
      conversationId: request.conversationId,
      ...(allAttachments.length > 0 ? { attachments: allAttachments } : {}),
    };
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
