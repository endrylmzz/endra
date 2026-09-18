// PROACTIVE-001/004: an in-process poller (ADR-007) that finds due
// reminders and pushes them out through the right channel adapter.
// Only Telegram exists today - a second channel adds its own
// deliverTo*() and a branch below, not a new abstraction layer.

import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseClient } from "../db/supabase-client.js";
import { deliverToTelegram } from "./deliver-telegram.js";
import { checkPriceAlerts } from "./price-alerts.js";
import { checkWeatherAlerts } from "./weather-alerts.js";

export interface DueReminder {
  id: string;
  content: string;
  dueAt: string;
  recurrenceSeconds: number | null;
  retryCount: number;
  channel: string;
  externalConversationId: string;
}

interface DueReminderRow {
  id: string;
  content: string;
  due_at: string;
  recurrence_seconds: number | null;
  retry_count: number;
  conversations: { channel: string; external_conversation_id: string };
}

export async function findDueReminders(
  client: SupabaseClient = getSupabaseClient(),
): Promise<DueReminder[]> {
  const { data, error } = await client
    .from("scheduled_jobs")
    .select(
      "id, content, due_at, recurrence_seconds, retry_count, conversations!inner(channel, external_conversation_id)",
    )
    .eq("status", "pending")
    .lte("due_at", new Date().toISOString());
  if (error) throw error;

  return ((data ?? []) as unknown as DueReminderRow[]).map((row) => ({
    id: row.id,
    content: row.content,
    dueAt: row.due_at,
    recurrenceSeconds: row.recurrence_seconds,
    retryCount: row.retry_count,
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
// so a delayed tick doesn't drift the schedule. Resets retry_count -
// each new occurrence gets its own fresh retry budget.
export async function rescheduleReminder(
  id: string,
  nextDueAt: string,
  client: SupabaseClient = getSupabaseClient(),
): Promise<void> {
  const { error } = await client
    .from("scheduled_jobs")
    .update({ due_at: nextDueAt, status: "pending", retry_count: 0 })
    .eq("id", id);
  if (error) throw error;
}

// A failed delivery gets a few more spaced-out attempts (this
// scheduler's own tick interval doubles as the retry backoff) before
// being given up on for good.
export async function incrementRetryCount(
  id: string,
  retryCount: number,
  client: SupabaseClient = getSupabaseClient(),
): Promise<void> {
  const { error } = await client
    .from("scheduled_jobs")
    .update({ retry_count: retryCount })
    .eq("id", id);
  if (error) throw error;
}

const MAX_DELIVERY_RETRIES = 3;

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
      if (job.retryCount < MAX_DELIVERY_RETRIES) {
        await incrementRetryCount(job.id, job.retryCount + 1, client).catch(() => {});
      } else {
        await markReminderStatus(job.id, "failed", client).catch(() => {});
      }
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
    checkWeatherAlerts().catch((err: unknown) => {
      console.error("Weather alert check failed:", err);
    });
  }, intervalMs);
}
