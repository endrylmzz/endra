import type { EndraTool } from "@endra/agent-contracts";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseClient } from "../../db/supabase-client.js";

// Activates the "decision" memory type (CLAUDE.md section 7) as a real
// structured record with an optional proactive follow-up, rather than
// a passive semantic-memory blob nobody ever revisits. Reuses the
// existing scheduled_jobs/scheduler infrastructure for the follow-up
// nudge - no new delivery mechanism needed.

export interface OpenDecision {
  id: string;
  decision: string;
  reasoning: string | null;
}

/** Injected into the system prompt (message-service.ts) so ENDRA
 * recognizes a later "o karar iyi sonuçlandı" as answering a specific
 * open decision, without needing the original follow-up nudge to be
 * present in raw chat history. */
export async function listOpenDecisions(
  userId: string,
  client: SupabaseClient = getSupabaseClient(),
): Promise<OpenDecision[]> {
  const { data, error } = await client
    .from("decisions")
    .select("id, decision, reasoning")
    .eq("user_id", userId)
    .eq("status", "open");
  if (error) throw error;
  return (data ?? []) as OpenDecision[];
}

// write-risk, no confirmation - journaling a decision is low-stakes.
export function createLogDecisionTool(client: SupabaseClient = getSupabaseClient()): EndraTool {
  return {
    name: "log_decision",
    description:
      "Logs a decision Ender made, with the reasoning behind it, for future reference. Optionally schedules a proactive follow-up in N days asking how it went.",
    category: "productivity",
    riskLevel: "write",
    requiresConfirmation: false,
    inputSchema: {
      type: "object",
      required: ["decision"],
      properties: {
        decision: { type: "string" },
        reasoning: { type: "string" },
        followUpInDays: { type: "integer", description: "e.g. 14 - omit for no follow-up" },
      },
      additionalProperties: false,
    },
    async execute(input, context) {
      const { decision, reasoning, followUpInDays } = input as {
        decision: string;
        reasoning?: string;
        followUpInDays?: number;
      };

      let followUpReminderId: string | undefined;
      let followUpDate: string | undefined;
      if (followUpInDays !== undefined) {
        if (followUpInDays <= 0) {
          return { success: false, error: "followUpInDays must be a positive number of days" };
        }
        const dueAt = new Date(Date.now() + followUpInDays * 24 * 60 * 60 * 1000).toISOString();
        const { data: job, error: jobError } = await client
          .from("scheduled_jobs")
          .insert({
            user_id: context.userId,
            conversation_id: context.conversationId,
            content: `Geçmişte şu kararı almıştın: "${decision}". Nasıl sonuçlandı, güncelleme yapmak ister misin?`,
            due_at: dueAt,
          })
          .select("id")
          .single();
        if (jobError) return { success: false, error: jobError.message };
        followUpReminderId = job.id as string;
        followUpDate = dueAt;
      }

      const { data, error } = await client
        .from("decisions")
        .insert({
          user_id: context.userId,
          conversation_id: context.conversationId,
          decision,
          reasoning: reasoning ?? null,
          ...(followUpReminderId ? { follow_up_reminder_id: followUpReminderId } : {}),
        })
        .select("id")
        .single();
      if (error) return { success: false, error: error.message };

      return {
        success: true,
        data: { id: data.id as string, decision, ...(followUpDate ? { followUpDate } : {}) },
      };
    },
  };
}

// read-risk, no confirmation - lists the user's decisions.
export function createListDecisionsTool(client: SupabaseClient = getSupabaseClient()): EndraTool {
  return {
    name: "list_decisions",
    description: "Lists the user's logged decisions (open by default, or all including resolved).",
    category: "productivity",
    riskLevel: "read",
    requiresConfirmation: false,
    inputSchema: {
      type: "object",
      properties: {
        includeResolved: { type: "boolean", description: "Default false" },
      },
      additionalProperties: false,
    },
    async execute(input, context) {
      const { includeResolved } = input as { includeResolved?: boolean };
      let query = client
        .from("decisions")
        .select("id, decision, reasoning, status, outcome, created_at")
        .eq("user_id", context.userId);
      if (!includeResolved) query = query.eq("status", "open");
      const { data, error } = await query.order("created_at", { ascending: false });
      if (error) return { success: false, error: error.message };
      return { success: true, data };
    },
  };
}

// write-risk, no confirmation - recording an outcome, not destroying
// anything.
export function createResolveDecisionTool(client: SupabaseClient = getSupabaseClient()): EndraTool {
  return {
    name: "resolve_decision",
    description:
      "Marks a logged decision as resolved with its outcome (use list_decisions first to find its id).",
    category: "productivity",
    riskLevel: "write",
    requiresConfirmation: false,
    inputSchema: {
      type: "object",
      required: ["decisionId", "outcome"],
      properties: {
        decisionId: { type: "string" },
        outcome: { type: "string" },
      },
      additionalProperties: false,
    },
    async execute(input, context) {
      const { decisionId, outcome } = input as { decisionId: string; outcome: string };
      const { error } = await client
        .from("decisions")
        .update({ status: "resolved", outcome })
        .eq("id", decisionId)
        .eq("user_id", context.userId);
      if (error) return { success: false, error: error.message };
      return { success: true, data: { resolved: decisionId } };
    },
  };
}
