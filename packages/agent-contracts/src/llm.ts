// LLM provider abstraction - lets ENDRA Core call any LLM vendor behind the
// same interface (see CLAUDE.md section 16 / docs/decisions).
// Only what's needed today: a single non-streaming `generate` call.
// Streaming and tool-calling are added when something actually needs them
// (voice/Telegram streaming in Phase 7, tool routing in Phase 3).

export interface LLMMessage {
  role: "user" | "assistant";
  content: string;
}

export interface LLMGenerateRequest {
  systemPrompt?: string;
  messages: LLMMessage[];
}

export interface LLMGenerateResponse {
  content: string;
  model: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
  };
}

export interface LLMProvider {
  readonly name: string;
  generate(request: LLMGenerateRequest): Promise<LLMGenerateResponse>;
}
