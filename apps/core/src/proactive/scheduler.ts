// PROACTIVE-001/004: an in-process poller (ADR-007) that finds due
// reminders and pushes them out through the right channel adapter.
// Only Telegram exists today - a second channel adds its own
// deliverTo*() and a branch below, not a new abstraction layer.

import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseClient } from "../db/supabase-client.js";
import { deliverToTelegram } from "./deliver-telegram.js";

export interface DueReminder {
  id: string;
  content: string;
  channel: string;
  externalConversationId: string;
}

interface DueReminderRow {
  id: string;
  content: string;
  conversations: { channel: string; external_conversation_id: string };
}

export async function findDueReminders(
  client: SupabaseClient = getSupabaseClient(),
): Promise<DueReminder[]> {
  const { data, error } = await client
    .from("scheduled_jobs")
    .select("id, content, conversations!inner(channel, external_conversation_id)")
    .eq("status", "pending")
    .lte("due_at", new Date().toISOString());
  if (error) throw error;

  return ((data ?? []) as unknown as DueReminderRow[]).map((row) => ({
    id: row.id,
    content: row.content,
    channel: row.conversations.channel,
    externalConversationId: row.conversations.external_conversation_id,
  }));
}

export async function markReminderStatus(
  id: string,
  status: "sent" | "failed",
  client: SupabaseClient = getSupabaseClient(),
): Promise<void> {
  const { error } = await client.from("scheduled_jobs").update({ status }).eq("id", id);
  if (error) throw error;
}

export async function checkAndDeliverDueJobs(
  client: SupabaseClient = getSupabaseClient(),
  deliver: typeof deliverToTelegram = deliverToTelegram,
): Promise<void> {
  const due = await findDueReminders(client);

  for (const job of due) {
    if (job.channel !== "telegram") {
      console.error(`No delivery path for channel "${job.channel}" - skipping reminder ${job.id}`);
      continue;
    }
    try {
      await deliver(job.externalConversationId, job.content);
      await markReminderStatus(job.id, "sent", client);
    } catch (err) {
      console.error("Failed to deliver reminder", job.id, err);
      await markReminderStatus(job.id, "failed", client).catch(() => {});
    }
  }
}

const DEFAULT_INTERVAL_MS = 30_000;

export function startScheduler(
  intervalMs: number = DEFAULT_INTERVAL_MS,
): ReturnType<typeof setInterval> {
  return setInterval(() => {
    checkAndDeliverDueJobs().catch((err: unknown) => {
      console.error("Scheduler tick failed:", err);
    });
  }, intervalMs);
}
