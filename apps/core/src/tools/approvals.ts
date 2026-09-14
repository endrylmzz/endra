// TOOLARCH-005: confirmation state for write/critical tools (CLAUDE.md
// section 20). The LLM cannot re-issue different arguments after
// approval - resolveApproval() always executes with the arguments that
// were stored when the approval was created, never anything supplied
// at confirmation time.

import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseClient } from "../db/supabase-client.js";

const APPROVAL_TTL_MS = 5 * 60 * 1000;
const APPROVAL_COLUMNS = "id, tool_name, arguments, status, expires_at";

export interface Approval {
  id: string;
  toolName: string;
  arguments: unknown;
  status: "pending" | "approved" | "rejected" | "expired";
  expiresAt: string;
}

function toApproval(row: {
  id: unknown;
  tool_name: unknown;
  arguments: unknown;
  status: unknown;
  expires_at: unknown;
}): Approval {
  return {
    id: row.id as string,
    toolName: row.tool_name as string,
    arguments: row.arguments,
    status: row.status as Approval["status"],
    expiresAt: row.expires_at as string,
  };
}

export async function createApproval(
  params: { userId: string; conversationId: string; toolName: string; arguments: unknown },
  client: SupabaseClient = getSupabaseClient(),
): Promise<Approval> {
  const { data, error } = await client
    .from("approvals")
    .insert({
      user_id: params.userId,
      conversation_id: params.conversationId,
      tool_name: params.toolName,
      arguments: params.arguments,
      expires_at: new Date(Date.now() + APPROVAL_TTL_MS).toISOString(),
    })
    .select(APPROVAL_COLUMNS)
    .single();
  if (error) throw error;
  return toApproval(data);
}

export async function getApproval(
  approvalId: string,
  client: SupabaseClient = getSupabaseClient(),
): Promise<Approval | undefined> {
  const { data, error } = await client
    .from("approvals")
    .select(APPROVAL_COLUMNS)
    .eq("id", approvalId)
    .maybeSingle();
  if (error) throw error;
  return data ? toApproval(data) : undefined;
}

/** The most recent still-pending, unexpired approval in a conversation, if any. */
export async function findPendingApproval(
  conversationId: string,
  client: SupabaseClient = getSupabaseClient(),
): Promise<Approval | undefined> {
  const { data, error } = await client
    .from("approvals")
    .select(APPROVAL_COLUMNS)
    .eq("conversation_id", conversationId)
    .eq("status", "pending")
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data ? toApproval(data) : undefined;
}

export async function resolveApprovalStatus(
  approvalId: string,
  status: "approved" | "rejected",
  client: SupabaseClient = getSupabaseClient(),
): Promise<void> {
  const { error } = await client
    .from("approvals")
    .update({ status, resolved_at: new Date().toISOString() })
    .eq("id", approvalId)
    .eq("status", "pending");
  if (error) throw error;
}
