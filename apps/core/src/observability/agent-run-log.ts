// CORE-009: agent run logging (CLAUDE.md section 25). Records what an
// LLM call did - never private chain-of-thought/reasoning, just
// observable facts (provider, model, timing, token usage, outcome).

import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseClient } from "../db/supabase-client.js";

export interface AgentRunLogEntry {
  conversationId?: string;
  userId?: string;
  provider: string;
  model: string;
  status: "success" | "error";
  durationMs: number;
  inputTokens?: number;
  outputTokens?: number;
  errorMessage?: string;
}

export async function logAgentRun(
  entry: AgentRunLogEntry,
  client: SupabaseClient = getSupabaseClient(),
): Promise<void> {
  const { error } = await client.from("agent_runs").insert({
    conversation_id: entry.conversationId ?? null,
    user_id: entry.userId ?? null,
    provider: entry.provider,
    model: entry.model,
    status: entry.status,
    duration_ms: entry.durationMs,
    input_tokens: entry.inputTokens ?? null,
    output_tokens: entry.outputTokens ?? null,
    error_message: entry.errorMessage ?? null,
  });

  if (error) {
    // A logging failure must not take down the user-facing response -
    // surface it in the process logs and move on.
    console.error({ err: error }, "failed to write agent_runs log entry");
  }
}
