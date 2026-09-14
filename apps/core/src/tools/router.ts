// TOOLARCH-003: dispatches a tool call to the right registered tool.
// Write/critical tools that require confirmation never execute
// immediately - they create a pending approval instead (TOOLARCH-005).
// confirm() always re-executes with the arguments stored at approval
// time, never anything supplied later - the LLM cannot smuggle in
// different arguments after approval (CLAUDE.md section 20).

import type { EndraTool, ToolResult } from "@endra/agent-contracts";
import { createApproval, getApproval, resolveApprovalStatus } from "./approvals.js";
import { logToolRun } from "./tool-run-log.js";
import type { ToolRegistry } from "./registry.js";

export interface ToolCallRequest {
  name: string;
  arguments: unknown;
}

export interface ToolRouterContext {
  userId: string;
  conversationId: string;
}

export type ToolRouteResult =
  { type: "executed"; result: ToolResult } | { type: "pending_confirmation"; approvalId: string };

export interface ToolRouterDeps {
  createApproval: typeof createApproval;
  getApproval: typeof getApproval;
  resolveApprovalStatus: typeof resolveApprovalStatus;
  logToolRun: typeof logToolRun;
}

const defaultDeps: ToolRouterDeps = {
  createApproval,
  getApproval,
  resolveApprovalStatus,
  logToolRun,
};

export class ToolRouter {
  private readonly deps: ToolRouterDeps;

  constructor(
    private readonly registry: ToolRegistry,
    deps: Partial<ToolRouterDeps> = {},
  ) {
    this.deps = { ...defaultDeps, ...deps };
  }

  async route(call: ToolCallRequest, context: ToolRouterContext): Promise<ToolRouteResult> {
    const tool = this.registry.get(call.name);
    if (!tool) {
      return { type: "executed", result: { success: false, error: `Unknown tool: ${call.name}` } };
    }

    if (tool.requiresConfirmation) {
      const approval = await this.deps.createApproval({
        userId: context.userId,
        conversationId: context.conversationId,
        toolName: tool.name,
        arguments: call.arguments,
      });
      await this.deps.logToolRun({
        conversationId: context.conversationId,
        userId: context.userId,
        toolName: tool.name,
        arguments: call.arguments,
        status: "pending_confirmation",
      });
      return { type: "pending_confirmation", approvalId: approval.id };
    }

    return this.execute(tool, call.arguments, context);
  }

  async confirm(approvalId: string, context: ToolRouterContext): Promise<ToolResult> {
    const approval = await this.deps.getApproval(approvalId);
    if (!approval || approval.status !== "pending") {
      return { success: false, error: "Approval not found or already resolved" };
    }
    if (new Date(approval.expiresAt).getTime() < Date.now()) {
      return { success: false, error: "Approval expired" };
    }

    const tool = this.registry.get(approval.toolName);
    if (!tool) {
      return { success: false, error: `Unknown tool: ${approval.toolName}` };
    }

    await this.deps.resolveApprovalStatus(approvalId, "approved");
    const outcome = await this.execute(tool, approval.arguments, context);
    return outcome.result;
  }

  private async execute(
    tool: EndraTool,
    args: unknown,
    context: ToolRouterContext,
  ): Promise<{ type: "executed"; result: ToolResult }> {
    const startedAt = Date.now();
    try {
      const result = await tool.execute(args, context);
      await this.deps.logToolRun({
        conversationId: context.conversationId,
        userId: context.userId,
        toolName: tool.name,
        arguments: args,
        status: result.success ? "success" : "error",
        result: result.data,
        durationMs: Date.now() - startedAt,
        errorMessage: result.error,
      });
      return { type: "executed", result };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await this.deps.logToolRun({
        conversationId: context.conversationId,
        userId: context.userId,
        toolName: tool.name,
        arguments: args,
        status: "error",
        durationMs: Date.now() - startedAt,
        errorMessage: message,
      });
      return { type: "executed", result: { success: false, error: message } };
    }
  }
}
