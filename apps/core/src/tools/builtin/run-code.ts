import OpenAI from "openai";
import type { EndraTool } from "@endra/agent-contracts";

// OpenAI's own hosted code_interpreter tool (Responses API) - real,
// sandboxed Python execution, billed through the already-configured
// OPENAI_API_KEY. For anything beyond the "calculator" tool's basic
// arithmetic: real math, data analysis, generating/verifying results.
const DEFAULT_CODE_MODEL = "gpt-5.6";

let defaultClient: OpenAI | undefined;
function getDefaultClient(): OpenAI {
  defaultClient ??= new OpenAI();
  return defaultClient;
}

export function createRunCodeTool(client: OpenAI = getDefaultClient()): EndraTool {
  return {
    name: "run_code",
    description:
      "Runs real Python code in a sandbox for anything beyond basic arithmetic - real math, data analysis, generating/verifying a result. Use the simple calculator tool instead for plain +-*/ expressions.",
    category: "productivity",
    riskLevel: "read",
    requiresConfirmation: false,
    inputSchema: {
      type: "object",
      required: ["task"],
      properties: {
        task: {
          type: "string",
          description: "What to compute or analyze, in plain language (or as code)",
        },
      },
      additionalProperties: false,
    },
    async execute(input) {
      const { task } = input as { task: string };
      const model = process.env.OPENAI_CODE_MODEL ?? DEFAULT_CODE_MODEL;
      const response = await client.responses.create({
        model,
        tools: [{ type: "code_interpreter", container: { type: "auto" } }],
        input: task,
      });
      if (!response.output_text) {
        return { success: false, error: "Code interpreter returned no answer" };
      }
      return { success: true, data: { answer: response.output_text } };
    },
  };
}
