import { describe, expect, it, vi } from "vitest";
import type { EndraTool, LLMGenerateResponse, LLMProvider } from "@endra/agent-contracts";
import { ToolRegistry } from "../tools/registry.js";
import type { ToolRouter, ToolRouteResult } from "../tools/router.js";
import { handleMessage, type MessageServiceDeps } from "./message-service.js";

function fakeTool(overrides: Partial<EndraTool> = {}): EndraTool {
  return {
    name: "get_current_time",
    description: "Returns the current time.",
    category: "information",
    riskLevel: "read",
    requiresConfirmation: false,
    inputSchema: {},
    execute: vi.fn(async () => ({ success: true, data: "12:00" })),
    ...overrides,
  };
}

function fakeToolRouter(overrides: Partial<ToolRouter> = {}): ToolRouter {
  return {
    route: vi.fn(async (): Promise<ToolRouteResult> => ({
      type: "executed",
      result: { success: true },
    })),
    confirm: vi.fn(async () => ({ success: true })),
    ...overrides,
  } as unknown as ToolRouter;
}

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

  const registry = new ToolRegistry();
  registry.register(fakeTool());

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
    toolRegistry: registry,
    toolRouter: fakeToolRouter(),
    findPendingApproval: vi.fn(async () => undefined),
    resolveApprovalStatus: vi.fn(async () => {}),
    ...overrides,
  };

  return { deps, calls };
}

async function flushMicrotasks() {
  await new Promise((resolve) => setImmediate(resolve));
}

const baseRequest = {
  channel: "api" as const,
  userId: "ender",
  conversationId: "public-conv-id",
  message: "Merhaba",
};

describe("handleMessage - normal flow (no tools involved)", () => {
  it("resolves identity, loads history, calls the LLM, persists both sides, and logs success", async () => {
    const { deps, calls } = fakeDeps();

    const result = await handleMessage(baseRequest, deps);

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

  it("passes the registered tools' definitions to the LLM", async () => {
    const { deps } = fakeDeps();

    await handleMessage(baseRequest, deps);

    expect(deps.llmProvider?.generate).toHaveBeenCalledWith(
      expect.objectContaining({
        tools: [
          { name: "get_current_time", description: "Returns the current time.", inputSchema: {} },
        ],
      }),
    );
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

    await handleMessage(baseRequest, deps);

    expect(deps.llmProvider?.generate).toHaveBeenCalledWith(
      expect.objectContaining({
        systemPrompt: expect.stringContaining("Ender TypeScript sever."),
      }),
    );
  });

  it("extracts and promotes memory candidates in the background after replying", async () => {
    const { deps } = fakeDeps();

    await handleMessage(baseRequest, deps);
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

    const result = await handleMessage(baseRequest, deps);
    await flushMicrotasks();

    expect(result).toEqual({ message: "Merhaba Ender.", conversationId: "public-conv-id" });
  });

  it("logs an error run and rethrows when the LLM call fails", async () => {
    const llmProvider: LLMProvider = {
      name: "fake-provider",
      generate: vi.fn().mockRejectedValue(new Error("upstream failure")),
    };
    const { deps, calls } = fakeDeps({ llmProvider });

    await expect(handleMessage(baseRequest, deps)).rejects.toThrow("upstream failure");

    expect(calls.logAgentRun).toEqual([
      expect.objectContaining({ status: "error", errorMessage: "upstream failure" }),
    ]);
    expect(calls.saveMessage).toHaveLength(1);
  });
});

describe("handleMessage - tool calling", () => {
  it("routes a tool call, feeds the result back, and returns the LLM's final text", async () => {
    const generate = vi
      .fn()
      .mockResolvedValueOnce({
        content: "",
        model: "fake-model",
        usage: { inputTokens: 5, outputTokens: 2 },
        toolCalls: [{ id: "call_1", name: "get_current_time", arguments: {} }],
      })
      .mockResolvedValueOnce({
        content: "Şu an saat 12:00.",
        model: "fake-model",
        usage: { inputTokens: 8, outputTokens: 3 },
      });
    const llmProvider: LLMProvider = { name: "fake-provider", generate };
    const route = vi.fn(async (): Promise<ToolRouteResult> => ({
      type: "executed",
      result: { success: true, data: "12:00" },
    }));
    const { deps, calls } = fakeDeps({ llmProvider, toolRouter: fakeToolRouter({ route }) });

    const result = await handleMessage(baseRequest, deps);

    expect(route).toHaveBeenCalledWith(
      { name: "get_current_time", arguments: {} },
      { userId: "user-1", conversationId: "conv-internal-1" },
    );
    expect(result).toEqual({ message: "Şu an saat 12:00.", conversationId: "public-conv-id" });
    expect(calls.saveMessage).toContainEqual({
      conversationId: "conv-internal-1",
      message: { role: "assistant", content: "Şu an saat 12:00." },
    });
  });

  it("asks for confirmation (in the LLM's own words) and stops the loop when a tool requires it", async () => {
    const generate = vi
      .fn()
      .mockResolvedValueOnce({
        content: "",
        model: "fake-model",
        usage: { inputTokens: 5, outputTokens: 2 },
        toolCalls: [{ id: "call_1", name: "notes", arguments: { content: "sütü al" } }],
      })
      .mockResolvedValueOnce({
        content: "Süt almanı not almak istiyorum, onaylıyor musun?",
        model: "fake-model",
        usage: { inputTokens: 6, outputTokens: 4 },
      });
    const llmProvider: LLMProvider = { name: "fake-provider", generate };
    const route = vi.fn(async (): Promise<ToolRouteResult> => ({
      type: "pending_confirmation",
      approvalId: "approval-1",
    }));
    const registry = new ToolRegistry();
    registry.register(fakeTool({ name: "notes", description: "Bir not kaydeder" }));
    const { deps, calls } = fakeDeps({
      llmProvider,
      toolRegistry: registry,
      toolRouter: fakeToolRouter({ route }),
    });

    const result = await handleMessage(baseRequest, deps);

    expect(result.message).toBe("Süt almanı not almak istiyorum, onaylıyor musun?");
    expect(generate).toHaveBeenCalledTimes(2);
    // The second call must not offer tools - force a text answer, not
    // another tool call, while confirmation is pending.
    expect(generate.mock.calls[1][0]).not.toHaveProperty("tools");
    expect(calls.saveMessage).toContainEqual({
      conversationId: "conv-internal-1",
      message: { role: "assistant", content: result.message },
    });
    // No natural final answer was produced for the original request -
    // nothing meaningful to consider for memory promotion this turn.
    expect(deps.extractMemoryCandidates).not.toHaveBeenCalled();
  });
});

describe("handleMessage - responding to a pending confirmation", () => {
  const pendingApproval = {
    id: "approval-1",
    toolName: "notes",
    arguments: { content: "sütü al" },
    status: "pending" as const,
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
  };

  it("confirms and executes the tool when the user approves, then replies in the LLM's own words", async () => {
    const confirm = vi.fn(async () => ({ success: true, data: { saved: "sütü al" } }));
    const generate = vi.fn().mockResolvedValue({
      content: "Tamam, not aldım!",
      model: "fake-model",
      usage: { inputTokens: 4, outputTokens: 3 },
    });
    const { deps, calls } = fakeDeps({
      llmProvider: { name: "fake-provider", generate },
      findPendingApproval: vi.fn(async () => pendingApproval),
      toolRouter: fakeToolRouter({ confirm }),
    });

    const result = await handleMessage({ ...baseRequest, message: "evet yap" }, deps);

    expect(confirm).toHaveBeenCalledWith("approval-1", {
      userId: "user-1",
      conversationId: "conv-internal-1",
    });
    expect(result.message).toBe("Tamam, not aldım!");
    expect(generate).toHaveBeenCalledWith(
      expect.objectContaining({
        systemPrompt: expect.stringContaining("notes"),
      }),
    );
    expect(calls.saveMessage).toContainEqual({
      conversationId: "conv-internal-1",
      message: { role: "assistant", content: result.message },
    });
  });

  it("rejects the pending approval when the user declines, then replies in the LLM's own words", async () => {
    const resolveApprovalStatus = vi.fn(async () => {});
    const generate = vi.fn().mockResolvedValue({
      content: "Tamam, iptal ettim.",
      model: "fake-model",
      usage: { inputTokens: 3, outputTokens: 2 },
    });
    const { deps } = fakeDeps({
      llmProvider: { name: "fake-provider", generate },
      findPendingApproval: vi.fn(async () => pendingApproval),
      resolveApprovalStatus,
    });

    const result = await handleMessage({ ...baseRequest, message: "hayır iptal et" }, deps);

    expect(resolveApprovalStatus).toHaveBeenCalledWith("approval-1", "rejected");
    expect(result.message).toBe("Tamam, iptal ettim.");
  });

  it("falls through to the normal flow when the reply is unrelated to the pending approval", async () => {
    const confirm = vi.fn();
    const { deps } = fakeDeps({
      findPendingApproval: vi.fn(async () => pendingApproval),
      toolRouter: fakeToolRouter({ confirm }),
    });

    const result = await handleMessage({ ...baseRequest, message: "bugün hava nasıl?" }, deps);

    expect(confirm).not.toHaveBeenCalled();
    expect(result).toEqual({ message: "Merhaba Ender.", conversationId: "public-conv-id" });
  });
});
