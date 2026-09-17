// PROACTIVE-001/004: an in-process poller (ADR-007) that finds due
// reminders and pushes them out through the right channel adapter.
// Only Telegram exists today - a second channel adds its own
// deliverTo*() and a branch below, not a new abstraction layer.

import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseClient } from "../db/supabase-client.js";
import { deliverToTelegram } from "./deliver-telegram.js";
import { checkPriceAlerts } from "./price-alerts.js";

export interface DueReminder {
  id: string;
  content: string;
  dueAt: string;
  recurrenceSeconds: number | null;
  channel: string;
  externalConversationId: string;
}

interface DueReminderRow {
  id: string;
  content: string;
  due_at: string;
  recurrence_seconds: number | null;
  conversations: { channel: string; external_conversation_id: string };
}

export async function findDueReminders(
  client: SupabaseClient = getSupabaseClient(),
): Promise<DueReminder[]> {
  const { data, error } = await client
    .from("scheduled_jobs")
    .select(
      "id, content, due_at, recurrence_seconds, conversations!inner(channel, external_conversation_id)",
    )
    .eq("status", "pending")
    .lte("due_at", new Date().toISOString());
  if (error) throw error;

  return ((data ?? []) as unknown as DueReminderRow[]).map((row) => ({
    id: row.id,
    content: row.content,
    dueAt: row.due_at,
    recurrenceSeconds: row.recurrence_seconds,
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

// PROACTIVE-002: advance a recurring reminder to its next occurrence
// instead of marking it sent - due_at + interval, not now + interval,
// so a delayed tick doesn't drift the schedule.
export async function rescheduleReminder(
  id: string,
  nextDueAt: string,
  client: SupabaseClient = getSupabaseClient(),
): Promise<void> {
  const { error } = await client
    .from("scheduled_jobs")
    .update({ due_at: nextDueAt, status: "pending" })
    .eq("id", id);
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
      if (job.recurrenceSeconds) {
        const nextDueAt = new Date(
          new Date(job.dueAt).getTime() + job.recurrenceSeconds * 1000,
        ).toISOString();
        await rescheduleReminder(job.id, nextDueAt, client);
      } else {
        await markReminderStatus(job.id, "sent", client);
      }
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
    checkPriceAlerts().catch((err: unknown) => {
      console.error("Price alert check failed:", err);
    });
  }, intervalMs);
}
