import OpenAI from "openai";
import type {
  LLMGenerateRequest,
  LLMGenerateResponse,
  LLMProvider,
  LLMToolCall,
} from "@endra/agent-contracts";

const DEFAULT_MAX_TOKENS = 1024;
const DEFAULT_MODEL = "gpt-5.6";

export interface OpenAIProviderOptions {
  apiKey?: string;
  model?: string;
  /** Inject a pre-built client in tests instead of hitting the real API. */
  client?: OpenAI;
}

function toOpenAIMessage(
  m: LLMGenerateRequest["messages"][number],
): OpenAI.Chat.ChatCompletionMessageParam {
  if (m.role === "tool") {
    return { role: "tool", tool_call_id: m.toolCallId ?? "", content: m.content };
  }
  if (m.role === "assistant" && m.toolCalls && m.toolCalls.length > 0) {
    return {
      role: "assistant",
      content: m.content || null,
      tool_calls: m.toolCalls.map((call) => ({
        id: call.id,
        type: "function",
        function: { name: call.name, arguments: JSON.stringify(call.arguments) },
      })),
    };
  }
  return { role: m.role, content: m.content };
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
    const tools: OpenAI.Chat.ChatCompletionTool[] | undefined = request.tools?.map((tool) => ({
      type: "function",
      function: { name: tool.name, description: tool.description, parameters: tool.inputSchema },
    }));

    const response = await this.client.chat.completions.create({
      model: this.model,
      max_completion_tokens: DEFAULT_MAX_TOKENS,
      messages: [
        ...(request.systemPrompt
          ? [{ role: "system" as const, content: request.systemPrompt }]
          : []),
        ...request.messages.map(toOpenAIMessage),
      ],
      // gpt-5.6 (a reasoning model) rejects function tools together with
      // its default reasoning_effort on /v1/chat/completions - has to be
      // turned off explicitly when tools are present.
      ...(tools && tools.length > 0 ? { tools, reasoning_effort: "none" } : {}),
    });

    const message = response.choices[0]?.message;
    const toolCalls: LLMToolCall[] | undefined = message?.tool_calls
      ?.filter(
        (call): call is Extract<typeof call, { type: "function" }> => call.type === "function",
      )
      .map((call) => ({
        id: call.id,
        name: call.function.name,
        arguments: JSON.parse(call.function.arguments || "{}") as unknown,
      }));

    return {
      content: message?.content ?? "",
      model: response.model,
      usage: {
        inputTokens: response.usage?.prompt_tokens ?? 0,
        outputTokens: response.usage?.completion_tokens ?? 0,
      },
      ...(toolCalls && toolCalls.length > 0 ? { toolCalls } : {}),
    };
  }
}
