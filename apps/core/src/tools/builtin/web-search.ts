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

// Extracted so deep-research.ts can reuse the same hosted search call
// for each of its sub-questions instead of duplicating the Responses
// API call.
export async function searchWeb(
  query: string,
  client: OpenAI = getDefaultClient(),
): Promise<string> {
  const model = process.env.OPENAI_SEARCH_MODEL ?? DEFAULT_SEARCH_MODEL;
  const response = await client.responses.create({
    model,
    tools: [{ type: "web_search" }],
    input: query,
  });
  if (!response.output_text) {
    throw new Error("Web search returned no answer");
  }
  return response.output_text;
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
      try {
        const answer = await searchWeb(query, client);
        return { success: true, data: { answer } };
      } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : String(err) };
      }
    },
  };
}
