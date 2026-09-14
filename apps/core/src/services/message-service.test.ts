import { describe, expect, it, vi } from "vitest";
import type { LLMGenerateResponse, LLMProvider } from "@endra/agent-contracts";
import { handleMessage, type MessageServiceDeps } from "./message-service.js";

function fakeDeps(overrides: Partial<MessageServiceDeps> = {}): {
  deps: Partial<MessageServiceDeps>;
  calls: Record<string, unknown[]>;
} {
  const calls: Record<string, unknown[]> = {
    saveMessage: [],
    logAgentRun: [],
  };

  const llmProvider: LLMProvider = {
    name: "fake-provider",
    generate: vi.fn(async (): Promise<LLMGenerateResponse> => ({
      content: "Merhaba Ender.",
      model: "fake-model",
      usage: { inputTokens: 10, outputTokens: 4 },
    })),
  };

  const deps: Partial<MessageServiceDeps> = {
    resolveIdentity: vi.fn(async () => ({ userId: "user-1", conversationId: "conv-internal-1" })),
    getRecentMessages: vi.fn(async () => [{ role: "user", content: "earlier message" } as const]),
    saveMessage: vi.fn(async (conversationId: string, message: unknown) => {
      calls.saveMessage.push({ conversationId, message });
    }),
    loadPersona: vi.fn(() => "You are ENDRA."),
    logAgentRun: vi.fn(async (entry: unknown) => {
      calls.logAgentRun.push(entry);
    }),
    llmProvider,
    ...overrides,
  };

  return { deps, calls };
}

describe("handleMessage", () => {
  it("resolves identity, loads history, calls the LLM, persists both sides, and logs success", async () => {
    const { deps, calls } = fakeDeps();

    const result = await handleMessage(
      { channel: "api", userId: "ender", conversationId: "public-conv-id", message: "Merhaba" },
      deps,
    );

    expect(result).toEqual({ message: "Merhaba Ender.", conversationId: "public-conv-id" });

    expect(deps.resolveIdentity).toHaveBeenCalledWith({
      channel: "api",
      externalUserId: "ender",
      externalConversationId: "public-conv-id",
    });

    expect(calls.saveMessage).toEqual([
      { conversationId: "conv-internal-1", message: { role: "user", content: "Merhaba" } },
      {
        conversationId: "conv-internal-1",
        message: { role: "assistant", content: "Merhaba Ender." },
      },
    ]);

    expect(deps.llmProvider?.generate).toHaveBeenCalledWith({
      systemPrompt: "You are ENDRA.",
      messages: [
        { role: "user", content: "earlier message" },
        { role: "user", content: "Merhaba" },
      ],
    });

    expect(calls.logAgentRun).toEqual([
      {
        conversationId: "conv-internal-1",
        userId: "user-1",
        provider: "fake-provider",
        model: "fake-model",
        status: "success",
        durationMs: expect.any(Number),
        inputTokens: 10,
        outputTokens: 4,
      },
    ]);
  });

  it("logs an error run and rethrows when the LLM call fails", async () => {
    const llmProvider: LLMProvider = {
      name: "fake-provider",
      generate: vi.fn().mockRejectedValue(new Error("upstream failure")),
    };
    const { deps, calls } = fakeDeps({ llmProvider });

    await expect(
      handleMessage(
        { channel: "api", userId: "ender", conversationId: "public-conv-id", message: "Merhaba" },
        deps,
      ),
    ).rejects.toThrow("upstream failure");

    expect(calls.logAgentRun).toEqual([
      expect.objectContaining({ status: "error", errorMessage: "upstream failure" }),
    ]);
    // Only the user's message was saved - no assistant reply to persist.
    expect(calls.saveMessage).toHaveLength(1);
  });
});
