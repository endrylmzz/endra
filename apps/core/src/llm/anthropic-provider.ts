import Anthropic from "@anthropic-ai/sdk";
import type { LLMGenerateRequest, LLMGenerateResponse, LLMProvider } from "@endra/agent-contracts";

const DEFAULT_MAX_TOKENS = 1024;

export interface AnthropicProviderOptions {
  apiKey?: string;
  model?: string;
  /** Inject a pre-built client in tests instead of hitting the real API. */
  client?: Anthropic;
}

export class AnthropicProvider implements LLMProvider {
  readonly name = "anthropic";
  private readonly client: Anthropic;
  private readonly model: string;

  constructor(options: AnthropicProviderOptions = {}) {
    const apiKey = options.apiKey ?? process.env.ANTHROPIC_API_KEY;
    if (!options.client && !apiKey) {
      throw new Error("ANTHROPIC_API_KEY is not set");
    }
    this.client = options.client ?? new Anthropic({ apiKey });
    this.model = options.model ?? process.env.ANTHROPIC_MODEL ?? "claude-sonnet-5";
  }

  async generate(request: LLMGenerateRequest): Promise<LLMGenerateResponse> {
    // Dormant provider (see ADR/DEVLOG - OpenAI is the active default).
    // Tool-calling was never implemented here: request.tools is ignored,
    // and any "tool" role message (Anthropic represents tool results
    // differently) is dropped rather than sent incorrectly.
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: DEFAULT_MAX_TOKENS,
      system: request.systemPrompt,
      messages: request.messages
        .filter((m): m is typeof m & { role: "user" | "assistant" } => m.role !== "tool")
        .map((m) => ({ role: m.role, content: m.content })),
    });

    const textBlock = response.content.find((block) => block.type === "text");

    return {
      content: textBlock?.text ?? "",
      model: response.model,
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      },
    };
  }
}
