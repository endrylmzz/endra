// LLM provider abstraction - lets ENDRA Core call any LLM vendor behind the
// same interface (see CLAUDE.md section 16 / docs/decisions).
// Streaming is still not needed yet (Phase 7). Tool-calling is now needed
// (Phase 3, wired into message-service.ts) - `tools` and `toolCalls` are
// optional so providers that don't implement it (AnthropicProvider, dormant)
// just ignore/omit them.

export interface LLMMessage {
  role: "user" | "assistant" | "tool";
  content: string;
  /** Set on a "tool" message - which tool call this is the result of. */
  toolCallId?: string;
  /** Set on an "assistant" message that requested tool calls. */
  toolCalls?: LLMToolCall[];
}

export interface LLMToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface LLMToolCall {
  id: string;
  name: string;
  arguments: unknown;
}

export interface LLMGenerateRequest {
  systemPrompt?: string;
  messages: LLMMessage[];
  tools?: LLMToolDefinition[];
}

export interface LLMGenerateResponse {
  content: string;
  model: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
  };
  toolCalls?: LLMToolCall[];
}

export interface LLMProvider {
  readonly name: string;
  generate(request: LLMGenerateRequest): Promise<LLMGenerateResponse>;
}
