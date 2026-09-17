import type { EndraTool } from "@endra/agent-contracts";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseClient } from "../../db/supabase-client.js";

// write-risk, no confirmation - scheduling a reminder is low-stakes and
// easily undone with cancel_reminder (unlike deleting something).
export function createSetReminderTool(client: SupabaseClient = getSupabaseClient()): EndraTool {
  return {
    name: "set_reminder",
    description:
      "Schedules a reminder that ENDRA will send back to the user by itself at the given time. Use get_current_time first to compute dueAt correctly from a relative request like 'in an hour' or 'tomorrow at 10'. For a repeating reminder ('every day at 9', 'every week'), also set recurrenceSeconds (e.g. 86400 for daily, 604800 for weekly) - dueAt is still the first occurrence.",
    category: "productivity",
    riskLevel: "write",
    requiresConfirmation: false,
    inputSchema: {
      type: "object",
      required: ["content", "dueAt"],
      properties: {
        content: { type: "string" },
        dueAt: {
          type: "string",
          description: "ISO 8601 timestamp of the first occurrence, e.g. 2026-09-16T10:00:00+03:00",
        },
        recurrenceSeconds: {
          type: "integer",
          description:
            "Repeat interval in seconds (e.g. 86400 = daily). Omit for a one-shot reminder.",
        },
      },
      additionalProperties: false,
    },
    async execute(input, context) {
      const { content, dueAt, recurrenceSeconds } = input as {
        content: string;
        dueAt: string;
        recurrenceSeconds?: number;
      };
      const parsed = new Date(dueAt);
      if (Number.isNaN(parsed.getTime())) {
        return { success: false, error: "dueAt is not a valid ISO 8601 timestamp" };
      }
      if (recurrenceSeconds !== undefined && recurrenceSeconds <= 0) {
        return { success: false, error: "recurrenceSeconds must be a positive number of seconds" };
      }
      const { data, error } = await client
        .from("scheduled_jobs")
        .insert({
          user_id: context.userId,
          conversation_id: context.conversationId,
          content,
          due_at: parsed.toISOString(),
          ...(recurrenceSeconds !== undefined ? { recurrence_seconds: recurrenceSeconds } : {}),
        })
        .select("id")
        .single();
      if (error) return { success: false, error: error.message };
      return {
        success: true,
        data: {
          id: data.id as string,
          content,
          dueAt: parsed.toISOString(),
          ...(recurrenceSeconds !== undefined ? { recurrenceSeconds } : {}),
        },
      };
    },
  };
}

// read-risk, no confirmation - shows the user's own pending reminders.
export function createListRemindersTool(client: SupabaseClient = getSupabaseClient()): EndraTool {
  return {
    name: "list_reminders",
    description: "Lists the user's pending reminders (not yet sent or cancelled), soonest first.",
    category: "productivity",
    riskLevel: "read",
    requiresConfirmation: false,
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    async execute(_input, context) {
      const { data, error } = await client
        .from("scheduled_jobs")
        .select("id, content, due_at, recurrence_seconds")
        .eq("user_id", context.userId)
        .eq("status", "pending")
        .order("due_at", { ascending: true });
      if (error) return { success: false, error: error.message };
      return { success: true, data };
    },
  };
}

// write-risk, requires confirmation - cancelling is hard to undo (the
// user would have to remember and re-ask for the original time).
export function createCancelReminderTool(client: SupabaseClient = getSupabaseClient()): EndraTool {
  return {
    name: "cancel_reminder",
    description: "Cancels a pending reminder by id (use list_reminders first to find it).",
    category: "productivity",
    riskLevel: "write",
    requiresConfirmation: true,
    inputSchema: {
      type: "object",
      required: ["reminderId"],
      properties: { reminderId: { type: "string" } },
      additionalProperties: false,
    },
    async execute(input, context) {
      const { reminderId } = input as { reminderId: string };
      const { error } = await client
        .from("scheduled_jobs")
        .update({ status: "cancelled" })
        .eq("id", reminderId)
        .eq("user_id", context.userId)
        .eq("status", "pending");
      if (error) return { success: false, error: error.message };
      return { success: true, data: { cancelled: reminderId } };
    },
  };
}
