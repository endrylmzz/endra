import OpenAI from "openai";
import type { LLMGenerateRequest, LLMGenerateResponse, LLMProvider } from "@endra/agent-contracts";

const DEFAULT_MAX_TOKENS = 1024;
const DEFAULT_MODEL = "gpt-5.6";

export interface OpenAIProviderOptions {
  apiKey?: string;
  model?: string;
  /** Inject a pre-built client in tests instead of hitting the real API. */
  client?: OpenAI;
}

export class OpenAIProvider implements LLMProvider {
  readonly name = "openai";
  private readonly client: OpenAI;
  private readonly model: string;

  constructor(options: OpenAIProviderOptions = {}) {
    const apiKey = options.apiKey ?? process.env.OPENAI_API_KEY;
    if (!options.client && !apiKey) {
      throw new Error("OPENAI_API_KEY is not set");
    }
    this.client = options.client ?? new OpenAI({ apiKey });
    this.model = options.model ?? process.env.OPENAI_MODEL ?? DEFAULT_MODEL;
  }

  async generate(request: LLMGenerateRequest): Promise<LLMGenerateResponse> {
    const response = await this.client.chat.completions.create({
      model: this.model,
      max_completion_tokens: DEFAULT_MAX_TOKENS,
      messages: [
        ...(request.systemPrompt
          ? [{ role: "system" as const, content: request.systemPrompt }]
          : []),
        ...request.messages.map((m) => ({ role: m.role, content: m.content })),
      ],
    });

    return {
      content: response.choices[0]?.message?.content ?? "",
      model: response.model,
      usage: {
        inputTokens: response.usage?.prompt_tokens ?? 0,
        outputTokens: response.usage?.completion_tokens ?? 0,
      },
    };
  }
}
