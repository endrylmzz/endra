// TOOLARCH-006: audit log for tool executions. Same pattern as
// observability/agent-run-log.ts - never throws on its own failure, so
// a logging outage can't break an actual tool call.

import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseClient } from "../db/supabase-client.js";

export interface ToolRunLogEntry {
  conversationId?: string;
  userId?: string;
  toolName: string;
  arguments: unknown;
  status: "success" | "error" | "pending_confirmation";
  result?: unknown;
  durationMs?: number;
  errorMessage?: string;
}

export async function logToolRun(
  entry: ToolRunLogEntry,
  client: SupabaseClient = getSupabaseClient(),
): Promise<void> {
  const { error } = await client.from("tool_runs").insert({
    conversation_id: entry.conversationId ?? null,
    user_id: entry.userId ?? null,
    tool_name: entry.toolName,
    arguments: entry.arguments,
    status: entry.status,
    result: entry.result ?? null,
    duration_ms: entry.durationMs ?? null,
    error_message: entry.errorMessage ?? null,
  });

  if (error) {
    console.error({ err: error }, "failed to write tool_runs log entry");
  }
}
