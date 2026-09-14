import type { EndraTool } from "@endra/agent-contracts";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseClient } from "../../db/supabase-client.js";

// write-risk, requiresConfirmation: true - the deliberate first tool to
// exercise the confirmation flow end to end (TOOLARCH-005).
export function createNotesTool(client: SupabaseClient = getSupabaseClient()): EndraTool {
  return {
    name: "notes",
    description: "Saves a short note for later.",
    category: "productivity",
    riskLevel: "write",
    requiresConfirmation: true,
    inputSchema: {
      type: "object",
      required: ["content"],
      properties: { content: { type: "string" } },
      additionalProperties: false,
    },
    async execute(input, context) {
      const { content } = input as { content: string };
      const { error } = await client.from("notes").insert({ user_id: context.userId, content });
      if (error) return { success: false, error: error.message };
      return { success: true, data: { saved: content } };
    },
  };
}
