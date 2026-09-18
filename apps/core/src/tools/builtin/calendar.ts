import type { EndraTool } from "@endra/agent-contracts";
import { getGoogleAccessToken } from "../../google/oauth-client.js";

// TOOLS-003: Google Calendar, primary calendar only (single-user
// today - see CLAUDE.md). Raw REST calls, no googleapis dependency -
// matches this codebase's existing pattern for external APIs.
const EVENTS_BASE = "https://www.googleapis.com/calendar/v3/calendars/primary/events";

interface CalendarEvent {
  id: string;
  summary?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
}

export function createListCalendarEventsTool(
  getAccessToken: typeof getGoogleAccessToken = getGoogleAccessToken,
): EndraTool {
  return {
    name: "list_calendar_events",
    description: "Lists upcoming events on the user's primary Google Calendar.",
    category: "productivity",
    riskLevel: "read",
    requiresConfirmation: false,
    inputSchema: {
      type: "object",
      properties: {
        maxResults: { type: "integer", description: "Default 10" },
      },
      additionalProperties: false,
    },
    async execute(input) {
      const { maxResults } = input as { maxResults?: number };
      const accessToken = await getAccessToken();
      const url = new URL(EVENTS_BASE);
      url.searchParams.set("timeMin", new Date().toISOString());
      url.searchParams.set("maxResults", String(maxResults ?? 10));
      url.searchParams.set("singleEvents", "true");
      url.searchParams.set("orderBy", "startTime");

      const response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
      if (!response.ok) {
        return { success: false, error: `Google Calendar request failed: ${response.status}` };
      }
      const data = (await response.json()) as { items?: CalendarEvent[] };
      const events = (data.items ?? []).map((event) => ({
        id: event.id,
        summary: event.summary,
        start: event.start?.dateTime ?? event.start?.date,
        end: event.end?.dateTime ?? event.end?.date,
      }));
      return { success: true, data: events };
    },
  };
}

// write-risk, requires confirmation - creates a real event on the
// user's actual calendar (and could notify attendees), unlike a
// private reminder in our own DB.
export function createCreateCalendarEventTool(
  getAccessToken: typeof getGoogleAccessToken = getGoogleAccessToken,
): EndraTool {
  return {
    name: "create_calendar_event",
    description: "Creates an event on the user's primary Google Calendar.",
    category: "productivity",
    riskLevel: "write",
    requiresConfirmation: true,
    inputSchema: {
      type: "object",
      required: ["summary", "startDateTime", "endDateTime"],
      properties: {
        summary: { type: "string" },
        startDateTime: { type: "string", description: "ISO 8601, e.g. 2026-09-20T10:00:00+03:00" },
        endDateTime: { type: "string", description: "ISO 8601" },
        description: { type: "string" },
      },
      additionalProperties: false,
    },
    async execute(input) {
      const { summary, startDateTime, endDateTime, description } = input as {
        summary: string;
        startDateTime: string;
        endDateTime: string;
        description?: string;
      };
      const accessToken = await getAccessToken();
      const response = await fetch(EVENTS_BASE, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          summary,
          ...(description ? { description } : {}),
          start: { dateTime: startDateTime },
          end: { dateTime: endDateTime },
        }),
      });
      if (!response.ok) {
        return { success: false, error: `Google Calendar request failed: ${response.status}` };
      }
      const event = (await response.json()) as CalendarEvent;
      return { success: true, data: { id: event.id, summary: event.summary } };
    },
  };
}

// write-risk, requires confirmation - mirrors cancel_reminder's
// reasoning: hard to undo, removes a real calendar entry.
export function createDeleteCalendarEventTool(
  getAccessToken: typeof getGoogleAccessToken = getGoogleAccessToken,
): EndraTool {
  return {
    name: "delete_calendar_event",
    description:
      "Deletes an event from the user's primary Google Calendar by id (use list_calendar_events first to find it).",
    category: "productivity",
    riskLevel: "write",
    requiresConfirmation: true,
    inputSchema: {
      type: "object",
      required: ["eventId"],
      properties: { eventId: { type: "string" } },
      additionalProperties: false,
    },
    async execute(input) {
      const { eventId } = input as { eventId: string };
      const accessToken = await getAccessToken();
      const response = await fetch(`${EVENTS_BASE}/${encodeURIComponent(eventId)}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!response.ok && response.status !== 410) {
        return { success: false, error: `Google Calendar request failed: ${response.status}` };
      }
      return { success: true, data: { deleted: eventId } };
    },
  };
}
