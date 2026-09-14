import { describe, expect, it, vi } from "vitest";
import type { EndraTool } from "@endra/agent-contracts";
import { ToolRegistry } from "./registry.js";
import { ToolRouter, type ToolRouterDeps } from "./router.js";

function readTool(execute: EndraTool["execute"]): EndraTool {
  return {
    name: "get_current_time",
    description: "test",
    category: "test",
    riskLevel: "read",
    requiresConfirmation: false,
    inputSchema: {},
    execute,
  };
}

function writeTool(execute: EndraTool["execute"]): EndraTool {
  return {
    name: "notes",
    description: "test",
    category: "test",
    riskLevel: "write",
    requiresConfirmation: true,
    inputSchema: {},
    execute,
  };
}

function fakeDeps(overrides: Partial<ToolRouterDeps> = {}): ToolRouterDeps {
  return {
    createApproval: vi.fn(async () => ({
      id: "approval-1",
      toolName: "notes",
      arguments: { content: "hi" },
      status: "pending" as const,
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    })),
    getApproval: vi.fn(async () => undefined),
    resolveApprovalStatus: vi.fn(async () => {}),
    logToolRun: vi.fn(async () => {}),
    ...overrides,
  };
}

const context = { userId: "user-1", conversationId: "conv-1" };

describe("ToolRouter.route", () => {
  it("executes a read tool immediately and logs success", async () => {
    const registry = new ToolRegistry();
    registry.register(readTool(async () => ({ success: true, data: "12:00" })));
    const deps = fakeDeps();
    const router = new ToolRouter(registry, deps);

    const outcome = await router.route({ name: "get_current_time", arguments: {} }, context);

    expect(outcome).toEqual({ type: "executed", result: { success: true, data: "12:00" } });
    expect(deps.logToolRun).toHaveBeenCalledWith(
      expect.objectContaining({ toolName: "get_current_time", status: "success" }),
    );
    expect(deps.createApproval).not.toHaveBeenCalled();
  });

  it("returns an error result for an unknown tool without touching approvals", async () => {
    const registry = new ToolRegistry();
    const deps = fakeDeps();
    const router = new ToolRouter(registry, deps);

    const outcome = await router.route({ name: "nope", arguments: {} }, context);

    expect(outcome).toEqual({
      type: "executed",
      result: { success: false, error: "Unknown tool: nope" },
    });
    expect(deps.createApproval).not.toHaveBeenCalled();
  });

  it("creates a pending approval instead of executing a confirmation-required tool", async () => {
    const registry = new ToolRegistry();
    const execute = vi.fn();
    registry.register(writeTool(execute));
    const deps = fakeDeps();
    const router = new ToolRouter(registry, deps);

    const outcome = await router.route({ name: "notes", arguments: { content: "hi" } }, context);

    expect(outcome).toEqual({ type: "pending_confirmation", approvalId: "approval-1" });
    expect(execute).not.toHaveBeenCalled();
    expect(deps.logToolRun).toHaveBeenCalledWith(
      expect.objectContaining({ status: "pending_confirmation" }),
    );
  });

  it("logs and returns a failure result when the tool itself throws", async () => {
    const registry = new ToolRegistry();
    registry.register(readTool(async () => Promise.reject(new Error("boom"))));
    const deps = fakeDeps();
    const router = new ToolRouter(registry, deps);

    const outcome = await router.route({ name: "get_current_time", arguments: {} }, context);

    expect(outcome).toEqual({ type: "executed", result: { success: false, error: "boom" } });
    expect(deps.logToolRun).toHaveBeenCalledWith(
      expect.objectContaining({ status: "error", errorMessage: "boom" }),
    );
  });
});

describe("ToolRouter.confirm", () => {
  it("executes with the arguments stored at approval time, not new ones", async () => {
    const registry = new ToolRegistry();
    const execute = vi.fn(async (input: unknown) => ({ success: true, data: input }));
    registry.register(writeTool(execute));
    const deps = fakeDeps({
      getApproval: vi.fn(async () => ({
        id: "approval-1",
        toolName: "notes",
        arguments: { content: "stored content" },
        status: "pending" as const,
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      })),
    });
    const router = new ToolRouter(registry, deps);

    const result = await router.confirm("approval-1", context);

    expect(execute).toHaveBeenCalledWith({ content: "stored content" }, context);
    expect(result).toEqual({ success: true, data: { content: "stored content" } });
    expect(deps.resolveApprovalStatus).toHaveBeenCalledWith("approval-1", "approved");
  });

  it("refuses to confirm an approval that no longer exists", async () => {
    const registry = new ToolRegistry();
    const deps = fakeDeps({ getApproval: vi.fn(async () => undefined) });
    const router = new ToolRouter(registry, deps);

    const result = await router.confirm("missing", context);

    expect(result.success).toBe(false);
  });

  it("refuses to confirm an already-resolved approval", async () => {
    const registry = new ToolRegistry();
    const deps = fakeDeps({
      getApproval: vi.fn(async () => ({
        id: "approval-1",
        toolName: "notes",
        arguments: {},
        status: "approved" as const,
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      })),
    });
    const router = new ToolRouter(registry, deps);

    const result = await router.confirm("approval-1", context);

    expect(result.success).toBe(false);
  });

  it("refuses to confirm an expired approval", async () => {
    const registry = new ToolRegistry();
    const deps = fakeDeps({
      getApproval: vi.fn(async () => ({
        id: "approval-1",
        toolName: "notes",
        arguments: {},
        status: "pending" as const,
        expiresAt: new Date(Date.now() - 1000).toISOString(),
      })),
    });
    const router = new ToolRouter(registry, deps);

    const result = await router.confirm("approval-1", context);

    expect(result).toEqual({ success: false, error: "Approval expired" });
  });
});
