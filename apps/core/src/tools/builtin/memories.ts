import type { EndraTool } from "@endra/agent-contracts";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseClient } from "../../db/supabase-client.js";
import { deleteMemory, listMemories } from "../../memory/semantic-memory.js";

// Long-term memory had no way to browse or delete anything directly -
// only similarity search (searchMemories) and the passive promotion
// pipeline. These close that gap, needed for memory hygiene (a
// proactive weekly nudge to review old/low-importance memories) to be
// more than an FYI notification.

// read-risk, no confirmation - just shows what's stored.
export function createListMemoriesTool(client: SupabaseClient = getSupabaseClient()): EndraTool {
  return {
    name: "list_memories",
    description:
      "Lists the user's stored long-term memories, most recent first - use to review, audit, or find one to delete.",
    category: "memory",
    riskLevel: "read",
    requiresConfirmation: false,
    inputSchema: {
      type: "object",
      properties: { limit: { type: "integer", description: "Default 20" } },
      additionalProperties: false,
    },
    async execute(input, context) {
      const { limit } = input as { limit?: number };
      const memories = await listMemories(context.userId, limit ?? 20, client);
      return { success: true, data: memories };
    },
  };
}

// write-risk, requires confirmation - permanent, mirrors this
// codebase's other delete-style tools.
export function createDeleteMemoryTool(client: SupabaseClient = getSupabaseClient()): EndraTool {
  return {
    name: "delete_memory",
    description:
      "Permanently deletes one stored memory by id (use list_memories first to find it).",
    category: "memory",
    riskLevel: "write",
    requiresConfirmation: true,
    inputSchema: {
      type: "object",
      required: ["memoryId"],
      properties: { memoryId: { type: "string" } },
      additionalProperties: false,
    },
    async execute(input, context) {
      const { memoryId } = input as { memoryId: string };
      await deleteMemory(context.userId, memoryId, client);
      return { success: true, data: { deleted: memoryId } };
    },
  };
}
