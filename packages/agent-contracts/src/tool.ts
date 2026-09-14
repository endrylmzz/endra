// Phase 3 tool architecture (CLAUDE.md sections 18-20). A tool can be a
// native TypeScript function or a wrapper around an MCP server's tool -
// both look the same to the registry/router.

export type ToolRiskLevel = "read" | "write" | "critical";

export interface ToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
}

export interface ToolExecutionContext {
  userId: string;
  conversationId: string;
}

export interface EndraTool {
  name: string;
  description: string;
  category: string;
  riskLevel: ToolRiskLevel;
  requiresConfirmation: boolean;
  /** JSON Schema describing the tool's input, for LLM function-calling. */
  inputSchema: Record<string, unknown>;
  execute(input: unknown, context: ToolExecutionContext): Promise<ToolResult>;
}
