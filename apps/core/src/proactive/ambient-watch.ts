// Checks every 15 minutes, per user, for a new unread email or an
// upcoming (within 45 min) calendar event, and asks the LLM whether
// it's actually worth proactively interrupting the user about - most
// new email/calendar activity isn't. Only delivers when the model
// says yes. This is the "Notify" tier of the 2026 ambient-agent
// pattern (notify / question / review) - ENDRA's other proactive
// checks (reminders, price/weather alerts) are unambiguous triggers
// that don't need this judgment call; this one is squarely about
// calibrating whether something merits an unsolicited ping at all.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { LLMProvider } from "@endra/agent-contracts";
import { getSupabaseClient } from "../db/supabase-client.js";
import { getPreference, setPreference } from "../memory/preferences.js";
import { getGoogleAccessToken } from "../google/oauth-client.js";
import { OpenAIProvider } from "../llm/openai-provider.js";
import { deliverToTelegram } from "./deliver-telegram.js";
import { findDeliveryTarget } from "./delivery-target.js";

const LAST_CHECKED_KEY = "ambient_watch_last_checked_at";
const LAST_SEEN_EMAIL_KEY = "ambient_last_seen_email_id";
const NOTIFIED_EVENT_IDS_KEY = "ambient_notified_event_ids";
const CHECK_INTERVAL_MS = 15 * 60 * 1000;
const UPCOMING_EVENT_WINDOW_MINUTES = 45;
const MAX_TRACKED_EVENT_IDS = 20;

const JUDGE_SYSTEM_PROMPT = `Sen ENDRA'sın, kullanıcının dijital ikinci beyni. Aşağıda az önce fark edilen yeni bir gelişme (okunmamış e-posta ve/veya yaklaşan bir takvim etkinliği) var. Görevin, bunun kullanıcıyı şu an, sormadan, proaktif olarak rahatsız etmeye değecek kadar önemli olup olmadığına karar vermek.

Sadece gerçekten dikkat gerektiren şeyler için bildirim öner: önemli/acil görünen bir e-posta, ya da yakında başlayacak ve hazırlıksız yakalanabileceği bir toplantı. Rutin, tanıtım amaçlı, otomatik bildirim e-postaları veya sıradan etkinlikler için bildirme.

Yanıtını SADECE şu JSON formatında ver, başka hiçbir şey yazma: {"shouldNotify": boolean, "message": string}. shouldNotify true ise message, kullanıcıya doğal, kısa bir Türkçe cümleyle durumu anlatsın. false ise message boş string olsun.`;

let defaultProvider: OpenAIProvider | undefined;
function getDefaultProvider(): OpenAIProvider {
  defaultProvider ??= new OpenAIProvider();
  return defaultProvider;
}

interface NewEmail {
  id: string;
  from: string;
  subject: string;
}

interface UpcomingEvent {
  id: string;
  summary: string;
  start: string;
}

export async function fetchNewestUnreadEmail(): Promise<NewEmail | undefined> {
  try {
    const accessToken = await getGoogleAccessToken();
    const url = new URL("https://gmail.googleapis.com/gmail/v1/users/me/messages");
    url.searchParams.set("q", "is:unread");
    url.searchParams.set("maxResults", "1");
    const listResponse = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!listResponse.ok) return undefined;
    const list = (await listResponse.json()) as { messages?: { id: string }[] };
    const first = list.messages?.[0];
    if (!first) return undefined;

    const metaUrl = new URL(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${first.id}`);
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
    return {
      id: first.id,
      from: headers.find((h) => h.name === "From")?.value ?? "",
      subject: headers.find((h) => h.name === "Subject")?.value ?? "(konu yok)",
    };
  } catch (err) {
    console.error("Ambient watch: fetching unread email failed", err);
    return undefined;
  }
}

export async function fetchUpcomingEvents(withinMinutes: number): Promise<UpcomingEvent[]> {
  try {
    const accessToken = await getGoogleAccessToken();
    const now = new Date();
    const soon = new Date(now.getTime() + withinMinutes * 60 * 1000);
    const url = new URL("https://www.googleapis.com/calendar/v3/calendars/primary/events");
    url.searchParams.set("timeMin", now.toISOString());
    url.searchParams.set("timeMax", soon.toISOString());
    url.searchParams.set("singleEvents", "true");
    url.searchParams.set("orderBy", "startTime");
    const response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!response.ok) return [];
    const data = (await response.json()) as {
      items?: { id: string; summary?: string; start?: { dateTime?: string } }[];
    };
    return (data.items ?? [])
      .filter((event): event is typeof event & { id: string; start: { dateTime: string } } =>
        Boolean(event.id && event.start?.dateTime),
      )
      .map((event) => ({
        id: event.id,
        summary: event.summary ?? "(başlıksız)",
        start: event.start.dateTime,
      }));
  } catch (err) {
    console.error("Ambient watch: fetching upcoming events failed", err);
    return [];
  }
}

export async function judgeWorthNotifying(
  llm: LLMProvider,
  context: {
    newEmail?: { from: string; subject: string };
    upcomingEvents: { summary: string; start: string }[];
  },
): Promise<{ shouldNotify: boolean; message: string }> {
  const parts: string[] = [];
  if (context.newEmail) {
    parts.push(
      `Yeni okunmamış e-posta: "${context.newEmail.from}" adresinden, konu: "${context.newEmail.subject}"`,
    );
  }
  for (const event of context.upcomingEvents) {
    parts.push(`Yaklaşan takvim etkinliği: "${event.summary}" (${event.start})`);
  }
  if (parts.length === 0) return { shouldNotify: false, message: "" };

  const response = await llm.generate({
    systemPrompt: JUDGE_SYSTEM_PROMPT,
    messages: [{ role: "user", content: parts.join("\n") }],
  });
  try {
    const parsed = JSON.parse(response.content) as { shouldNotify?: unknown; message?: unknown };
    return {
      shouldNotify: parsed.shouldNotify === true,
      message: typeof parsed.message === "string" ? parsed.message : "",
    };
  } catch {
    return { shouldNotify: false, message: "" };
  }
}

function isDue(lastCheckedAt: unknown): boolean {
  if (typeof lastCheckedAt !== "string") return true;
  const lastChecked = new Date(lastCheckedAt).getTime();
  return Number.isNaN(lastChecked) || Date.now() - lastChecked >= CHECK_INTERVAL_MS;
}

export async function checkAmbientWatch(
  client: SupabaseClient = getSupabaseClient(),
  deliver: typeof deliverToTelegram = deliverToTelegram,
  llm: LLMProvider = getDefaultProvider(),
  fetchEmail: typeof fetchNewestUnreadEmail = fetchNewestUnreadEmail,
  fetchEvents: typeof fetchUpcomingEvents = fetchUpcomingEvents,
): Promise<void> {
  const { data: users, error } = await client.from("users").select("id");
  if (error) throw error;

  for (const user of (users ?? []) as { id: string }[]) {
    try {
      const lastCheckedAt = await getPreference(user.id, LAST_CHECKED_KEY, client);
      if (!isDue(lastCheckedAt)) continue;

      const [lastSeenEmailId, notifiedEventIdsRaw] = await Promise.all([
        getPreference(user.id, LAST_SEEN_EMAIL_KEY, client),
        getPreference(user.id, NOTIFIED_EVENT_IDS_KEY, client),
      ]);
      const notifiedEventIds: string[] = Array.isArray(notifiedEventIdsRaw)
        ? (notifiedEventIdsRaw as string[])
        : [];
      // First-ever check just seeds the baseline - otherwise every
      // pre-existing unread email would look "new" the moment this
      // ships.
      const isFirstCheck = lastSeenEmailId === undefined;

      const [newestEmail, upcomingEvents] = await Promise.all([
        fetchEmail(),
        fetchEvents(UPCOMING_EVENT_WINDOW_MINUTES),
      ]);

      const hasNewEmail =
        !isFirstCheck && Boolean(newestEmail) && newestEmail?.id !== lastSeenEmailId;
      const newEvents = upcomingEvents.filter((event) => !notifiedEventIds.includes(event.id));

      if (hasNewEmail || newEvents.length > 0) {
        const judgment = await judgeWorthNotifying(llm, {
          newEmail:
            hasNewEmail && newestEmail
              ? { from: newestEmail.from, subject: newestEmail.subject }
              : undefined,
          upcomingEvents: newEvents.map((event) => ({
            summary: event.summary,
            start: event.start,
          })),
        });
        if (judgment.shouldNotify && judgment.message) {
          const target = await findDeliveryTarget(user.id, client);
          if (target?.channel === "telegram")
            await deliver(target.externalConversationId, judgment.message);
        }
      }

      if (newestEmail) await setPreference(user.id, LAST_SEEN_EMAIL_KEY, newestEmail.id, client);
      if (newEvents.length > 0) {
        const updated = [...notifiedEventIds, ...newEvents.map((event) => event.id)].slice(
          -MAX_TRACKED_EVENT_IDS,
        );
        await setPreference(user.id, NOTIFIED_EVENT_IDS_KEY, updated, client);
      }
      await setPreference(user.id, LAST_CHECKED_KEY, new Date().toISOString(), client);
    } catch (err) {
      console.error("Ambient watch check failed for user", user.id, err);
    }
  }
}
