import type { EndraTool } from "@endra/agent-contracts";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseClient } from "../../db/supabase-client.js";

// write-risk, requiresConfirmation: true - the deliberate first tool to
// exercise the confirmation flow end to end (TOOLARCH-005).
export function createNotesTool(client: SupabaseClient = getSupabaseClient()): EndraTool {
  return {
    name: "save_note",
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

// read-risk, no confirmation - just shows the user's own notes back.
export function createListNotesTool(client: SupabaseClient = getSupabaseClient()): EndraTool {
  return {
    name: "list_notes",
    description: "Lists the user's saved notes, most recent first.",
    category: "productivity",
    riskLevel: "read",
    requiresConfirmation: false,
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    async execute(_input, context) {
      const { data, error } = await client
        .from("notes")
        .select("id, content, created_at")
        .eq("user_id", context.userId)
        .order("created_at", { ascending: false });
      if (error) return { success: false, error: error.message };
      return { success: true, data };
    },
  };
}

// write-risk, requiresConfirmation: true - deletion is hard to undo.
export function createDeleteNoteTool(client: SupabaseClient = getSupabaseClient()): EndraTool {
  return {
    name: "delete_note",
    description: "Deletes one of the user's saved notes by id (use list_notes first to find it).",
    category: "productivity",
    riskLevel: "write",
    requiresConfirmation: true,
    inputSchema: {
      type: "object",
      required: ["noteId"],
      properties: { noteId: { type: "string" } },
      additionalProperties: false,
    },
    async execute(input, context) {
      const { noteId } = input as { noteId: string };
      const { error } = await client
        .from("notes")
        .delete()
        .eq("id", noteId)
        .eq("user_id", context.userId);
      if (error) return { success: false, error: error.message };
      return { success: true, data: { deleted: noteId } };
    },
  };
}
