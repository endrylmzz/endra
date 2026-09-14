// TOOLARCH-005: confirmation state for write/critical tools (CLAUDE.md
// section 20). The LLM cannot re-issue different arguments after
// approval - resolveApproval() always executes with the arguments that
// were stored when the approval was created, never anything supplied
// at confirmation time.

import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseClient } from "../db/supabase-client.js";

const APPROVAL_TTL_MS = 5 * 60 * 1000;

export interface Approval {
  id: string;
  toolName: string;
  arguments: unknown;
  status: "pending" | "approved" | "rejected" | "expired";
  expiresAt: string;
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
    .select("id, tool_name, arguments, status, expires_at")
    .single();
  if (error) throw error;

  return {
    id: data.id as string,
    toolName: data.tool_name as string,
    arguments: data.arguments,
    status: data.status as Approval["status"],
    expiresAt: data.expires_at as string,
  };
}

export async function getApproval(
  approvalId: string,
  client: SupabaseClient = getSupabaseClient(),
): Promise<Approval | undefined> {
  const { data, error } = await client
    .from("approvals")
    .select("id, tool_name, arguments, status, expires_at")
    .eq("id", approvalId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return undefined;

  return {
    id: data.id as string,
    toolName: data.tool_name as string,
    arguments: data.arguments,
    status: data.status as Approval["status"],
    expiresAt: data.expires_at as string,
  };
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
