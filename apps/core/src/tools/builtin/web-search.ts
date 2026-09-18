import OpenAI from "openai";
import type { EndraTool } from "@endra/agent-contracts";

// TOOLS-002 (properly, not the Wikipedia stand-in): OpenAI's own
// hosted web_search tool (Responses API), billed through the already-
// configured OPENAI_API_KEY - no separate search API key needed.
const DEFAULT_SEARCH_MODEL = "gpt-5.6";

let defaultClient: OpenAI | undefined;
function getDefaultClient(): OpenAI {
  defaultClient ??= new OpenAI();
  return defaultClient;
}

export function createWebSearchTool(client: OpenAI = getDefaultClient()): EndraTool {
  return {
    name: "web_search",
    description:
      "Searches the live web for current information - news, real-time facts, anything beyond static/encyclopedic knowledge (use search_wikipedia for that instead). Cites sources.",
    category: "research",
    riskLevel: "read",
    requiresConfirmation: false,
    inputSchema: {
      type: "object",
      required: ["query"],
      properties: { query: { type: "string" } },
      additionalProperties: false,
    },
    async execute(input) {
      const { query } = input as { query: string };
      const model = process.env.OPENAI_SEARCH_MODEL ?? DEFAULT_SEARCH_MODEL;
      const response = await client.responses.create({
        model,
        tools: [{ type: "web_search" }],
        input: query,
      });
      if (!response.output_text) {
        return { success: false, error: "Web search returned no answer" };
      }
      return { success: true, data: { answer: response.output_text } };
    },
  };
}
