// CORE-003/004: given a request's (channel, external userId,
// external conversationId), find or create the matching internal
// user/conversation rows in Supabase and return their ids.
//
// ENDRA is single-user today (see CLAUDE.md) - this does not attempt to
// link the same person across different channels into one identity.
// That's a real future need, not a current one; revisit when a second
// channel (Telegram) actually exists.

import type { EndraChannel } from "@endra/agent-contracts";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseClient } from "../db/supabase-client.js";

export interface ResolvedIdentity {
  userId: string;
  conversationId: string;
}

export async function resolveIdentity(
  params: {
    channel: EndraChannel;
    externalUserId: string;
    externalConversationId: string;
  },
  client: SupabaseClient = getSupabaseClient(),
): Promise<ResolvedIdentity> {
  const userId = await findOrCreateUser(client, params.externalUserId);
  const conversationId = await findOrCreateConversation(
    client,
    userId,
    params.channel,
    params.externalConversationId,
  );

  return { userId, conversationId };
}

async function findOrCreateUser(client: SupabaseClient, externalId: string): Promise<string> {
  const { data: existing, error: selectError } = await client
    .from("users")
    .select("id")
    .eq("external_id", externalId)
    .maybeSingle();
  if (selectError) throw selectError;
  if (existing) return existing.id as string;

  const { data: created, error: insertError } = await client
    .from("users")
    .insert({ external_id: externalId })
    .select("id")
    .single();
  if (insertError) throw insertError;
  return created.id as string;
}

async function findOrCreateConversation(
  client: SupabaseClient,
  userId: string,
  channel: EndraChannel,
  externalConversationId: string,
): Promise<string> {
  const { data: existing, error: selectError } = await client
    .from("conversations")
    .select("id")
    .eq("user_id", userId)
    .eq("channel", channel)
    .eq("external_conversation_id", externalConversationId)
    .maybeSingle();
  if (selectError) throw selectError;
  if (existing) return existing.id as string;

  const { data: created, error: insertError } = await client
    .from("conversations")
    .insert({ user_id: userId, channel, external_conversation_id: externalConversationId })
    .select("id")
    .single();
  if (insertError) throw insertError;
  return created.id as string;
}
