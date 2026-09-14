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
    searchMemories: vi.fn(async () => []),
    extractMemoryCandidates: vi.fn(async () => []),
    promoteMemories: vi.fn(async () => {}),
    loadPersona: vi.fn(() => "You are ENDRA."),
    logAgentRun: vi.fn(async (entry: unknown) => {
      calls.logAgentRun.push(entry);
    }),
    llmProvider,
    ...overrides,
  };

  return { deps, calls };
}

// Flush the microtask queue so a fire-and-forget chain started inside
// handleMessage (extract -> promote) has a chance to run before we
// assert on it.
async function flushMicrotasks() {
  await new Promise((resolve) => setImmediate(resolve));
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

  it("appends relevant long-term memories to the system prompt when found", async () => {
    const { deps } = fakeDeps({
      searchMemories: vi.fn(async () => [
        {
          id: "m1",
          content: "Ender TypeScript sever.",
          type: "semantic" as const,
          importance: 0.6,
          score: 0.9,
        },
      ]),
    });

    await handleMessage(
      { channel: "api", userId: "ender", conversationId: "public-conv-id", message: "Merhaba" },
      deps,
    );

    expect(deps.llmProvider?.generate).toHaveBeenCalledWith(
      expect.objectContaining({
        systemPrompt: expect.stringContaining("Ender TypeScript sever."),
      }),
    );
  });

  it("extracts and promotes memory candidates in the background after replying", async () => {
    const { deps } = fakeDeps();

    await handleMessage(
      { channel: "api", userId: "ender", conversationId: "public-conv-id", message: "Merhaba" },
      deps,
    );
    await flushMicrotasks();

    expect(deps.extractMemoryCandidates).toHaveBeenCalledWith(
      { userMessage: "Merhaba", assistantMessage: "Merhaba Ender." },
      deps.llmProvider,
    );
    expect(deps.promoteMemories).toHaveBeenCalledWith("user-1", []);
  });

  it("does not let a memory-promotion failure affect the response", async () => {
    const { deps } = fakeDeps({
      extractMemoryCandidates: vi.fn().mockRejectedValue(new Error("extraction failed")),
    });

    const result = await handleMessage(
      { channel: "api", userId: "ender", conversationId: "public-conv-id", message: "Merhaba" },
      deps,
    );
    await flushMicrotasks();

    expect(result).toEqual({ message: "Merhaba Ender.", conversationId: "public-conv-id" });
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
