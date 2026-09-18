// Once a day, per user: compose today's calendar + reminders due today
// + unread overnight email + open decisions into one digest message.
// Skips sending entirely when there's nothing to report - unsolicited
// pings with nothing in them are exactly the kind of proactivity the
// 2026 ambient-agent research warns against. Time is configurable via
// the existing preferences store ("morning_digest_time", "HH:MM"),
// interpreted in Europe/Istanbul (ENDRA is single-user, single-
// timezone today - no per-user timezone setting exists yet).

import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseClient } from "../db/supabase-client.js";
import { getPreference, setPreference } from "../memory/preferences.js";
import { getGoogleAccessToken } from "../google/oauth-client.js";
import { listOpenDecisions } from "../tools/builtin/decisions.js";
import { deliverToTelegram } from "./deliver-telegram.js";

const LAST_RUN_PREFERENCE_KEY = "morning_digest_last_run_at";
const DIGEST_TIME_PREFERENCE_KEY = "morning_digest_time";
const DEFAULT_DIGEST_TIME = "08:00";
const TIMEZONE = "Europe/Istanbul";

interface IstanbulParts {
  dateKey: string;
  hour: number;
  minute: number;
}

function istanbulParts(date = new Date()): IstanbulParts {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = Object.fromEntries(formatter.formatToParts(date).map((p) => [p.type, p.value]));
  return {
    dateKey: `${parts.year}-${parts.month}-${parts.day}`,
    hour: Number(parts.hour),
    minute: Number(parts.minute),
  };
}

export function isDigestDue(
  lastRunAt: unknown,
  digestTime: string,
  now: Date = new Date(),
): boolean {
  const [targetHourStr, targetMinuteStr] = digestTime.split(":");
  const targetHour = Number(targetHourStr);
  const targetMinute = Number(targetMinuteStr ?? "0");
  if (Number.isNaN(targetHour) || Number.isNaN(targetMinute)) return false;

  const current = istanbulParts(now);
  const alreadyRanToday =
    typeof lastRunAt === "string" && istanbulParts(new Date(lastRunAt)).dateKey === current.dateKey;
  if (alreadyRanToday) return false;

  return (
    current.hour > targetHour || (current.hour === targetHour && current.minute >= targetMinute)
  );
}

async function todaysCalendarLines(): Promise<string[]> {
  try {
    const accessToken = await getGoogleAccessToken();
    const { dateKey } = istanbulParts();
    const url = new URL("https://www.googleapis.com/calendar/v3/calendars/primary/events");
    url.searchParams.set("timeMin", `${dateKey}T00:00:00+03:00`);
    url.searchParams.set("timeMax", `${dateKey}T23:59:59+03:00`);
    url.searchParams.set("singleEvents", "true");
    url.searchParams.set("orderBy", "startTime");
    const response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!response.ok) return [];
    const data = (await response.json()) as {
      items?: { summary?: string; start?: { dateTime?: string; date?: string } }[];
    };
    return (data.items ?? []).map((event) => {
      const start = event.start?.dateTime;
      const time = start
        ? new Date(start).toLocaleTimeString("tr-TR", {
            timeZone: TIMEZONE,
            hour: "2-digit",
            minute: "2-digit",
          })
        : "Tüm gün";
      return `${time} - ${event.summary ?? "(başlıksız)"}`;
    });
  } catch (err) {
    console.error("Morning digest: fetching calendar failed", err);
    return [];
  }
}

export async function todaysReminderLines(
  userId: string,
  client: SupabaseClient,
): Promise<string[]> {
  const { dateKey } = istanbulParts();
  const { data, error } = await client
    .from("scheduled_jobs")
    .select("content, due_at")
    .eq("user_id", userId)
    .eq("status", "pending")
    .gte("due_at", `${dateKey}T00:00:00+03:00`)
    .lte("due_at", `${dateKey}T23:59:59+03:00`)
    .order("due_at", { ascending: true });
  if (error) {
    console.error("Morning digest: fetching reminders failed", error);
    return [];
  }
  return ((data ?? []) as { content: string; due_at: string }[]).map((job) => {
    const time = new Date(job.due_at).toLocaleTimeString("tr-TR", {
      timeZone: TIMEZONE,
      hour: "2-digit",
      minute: "2-digit",
    });
    return `${time} - ${job.content}`;
  });
}

async function overnightUnreadEmailLines(): Promise<string[]> {
  try {
    const accessToken = await getGoogleAccessToken();
    const url = new URL("https://gmail.googleapis.com/gmail/v1/users/me/messages");
    url.searchParams.set("q", "is:unread newer_than:1d");
    url.searchParams.set("maxResults", "5");
    const listResponse = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!listResponse.ok) return [];
    const list = (await listResponse.json()) as { messages?: { id: string }[] };

    return await Promise.all(
      (list.messages ?? []).map(async (m) => {
        const metaUrl = new URL(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${m.id}`);
        metaUrl.searchParams.set("format", "metadata");
        metaUrl.searchParams.append("metadataHeaders", "Subject");
        metaUrl.searchParams.append("metadataHeaders", "From");
        const metaResponse = await fetch(metaUrl, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        const meta = (await metaResponse.json()) as {
          payload?: { headers?: { name: string; value: string }[] };
        };
        const headers = meta.payload?.headers ?? [];
        const subject = headers.find((h) => h.name === "Subject")?.value ?? "(konu yok)";
        const from = headers.find((h) => h.name === "From")?.value ?? "";
        return `${from} - ${subject}`;
      }),
    );
  } catch (err) {
    console.error("Morning digest: fetching email failed", err);
    return [];
  }
}

async function openDecisionLines(userId: string, client: SupabaseClient): Promise<string[]> {
  try {
    const decisions = await listOpenDecisions(userId, client);
    return decisions.map((d) => d.decision);
  } catch (err) {
    console.error("Morning digest: fetching open decisions failed", err);
    return [];
  }
}

function composeDigest(sections: {
  calendar: string[];
  reminders: string[];
  email: string[];
  decisions: string[];
}): string | undefined {
  const blocks: string[] = [];
  if (sections.calendar.length > 0)
    blocks.push(`📅 Bugünkü takvim:\n${sections.calendar.map((l) => `- ${l}`).join("\n")}`);
  if (sections.reminders.length > 0)
    blocks.push(
      `⏰ Bugün vadesi gelen hatırlatıcılar:\n${sections.reminders.map((l) => `- ${l}`).join("\n")}`,
    );
  if (sections.email.length > 0)
    blocks.push(
      `📧 Gece gelen okunmamış mailler:\n${sections.email.map((l) => `- ${l}`).join("\n")}`,
    );
  if (sections.decisions.length > 0)
    blocks.push(`🗒️ Açık kararların:\n${sections.decisions.map((l) => `- ${l}`).join("\n")}`);
  if (blocks.length === 0) return undefined;
  return `Günaydın! Bugün için özet:\n\n${blocks.join("\n\n")}`;
}

async function findDeliveryTarget(
  userId: string,
  client: SupabaseClient,
): Promise<{ channel: string; externalConversationId: string } | undefined> {
  const { data, error } = await client
    .from("conversations")
    .select("channel, external_conversation_id")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) return undefined;
  return {
    channel: data.channel as string,
    externalConversationId: data.external_conversation_id as string,
  };
}

export async function checkMorningDigest(
  client: SupabaseClient = getSupabaseClient(),
  deliver: typeof deliverToTelegram = deliverToTelegram,
): Promise<void> {
  const { data: users, error } = await client.from("users").select("id");
  if (error) throw error;

  for (const user of (users ?? []) as { id: string }[]) {
    try {
      const [lastRunAt, digestTimePref] = await Promise.all([
        getPreference(user.id, LAST_RUN_PREFERENCE_KEY, client),
        getPreference(user.id, DIGEST_TIME_PREFERENCE_KEY, client),
      ]);
      const digestTime = typeof digestTimePref === "string" ? digestTimePref : DEFAULT_DIGEST_TIME;
      if (!isDigestDue(lastRunAt, digestTime)) continue;

      const [calendar, reminders, email, decisions] = await Promise.all([
        todaysCalendarLines(),
        todaysReminderLines(user.id, client),
        overnightUnreadEmailLines(),
        openDecisionLines(user.id, client),
      ]);
      const message = composeDigest({ calendar, reminders, email, decisions });

      if (message) {
        const target = await findDeliveryTarget(user.id, client);
        if (target?.channel === "telegram") {
          await deliver(target.externalConversationId, message);
        }
      }
      await setPreference(user.id, LAST_RUN_PREFERENCE_KEY, new Date().toISOString(), client);
    } catch (err) {
      console.error("Morning digest check failed for user", user.id, err);
    }
  }
}
