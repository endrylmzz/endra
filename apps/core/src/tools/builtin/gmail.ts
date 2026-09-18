import type { EndraTool } from "@endra/agent-contracts";
import { getGoogleAccessToken } from "../../google/oauth-client.js";

// TOOLS-004: Gmail, raw REST calls (no googleapis dependency, matches
// this codebase's existing pattern for external APIs).
const GMAIL_BASE = "https://gmail.googleapis.com/gmail/v1/users/me";

function base64UrlEncode(text: string): string {
  return Buffer.from(text, "utf-8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function base64UrlDecode(data: string): string {
  return Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf-8");
}

// Email headers can't carry raw non-ASCII bytes - RFC 2047 encoded-word
// is required (unlike the body, whose encoding is covered by the
// Content-Type/charset declaration instead).
function encodeHeaderValue(value: string): string {
  // eslint-disable-next-line no-control-regex
  if (/^[\x00-\x7F]*$/.test(value)) return value;
  return `=?UTF-8?B?${Buffer.from(value, "utf-8").toString("base64")}?=`;
}

interface GmailMessagePart {
  mimeType?: string;
  body?: { data?: string };
  parts?: GmailMessagePart[];
}

function findPlainTextBody(part: GmailMessagePart): string | undefined {
  if (part.mimeType === "text/plain" && part.body?.data) return base64UrlDecode(part.body.data);
  for (const child of part.parts ?? []) {
    const found = findPlainTextBody(child);
    if (found !== undefined) return found;
  }
  return undefined;
}

function headerValue(headers: { name: string; value: string }[] | undefined, name: string): string {
  return headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? "";
}

// read-risk, no confirmation - lists metadata only (subject/from/date),
// never the full body.
export function createListEmailsTool(
  getAccessToken: typeof getGoogleAccessToken = getGoogleAccessToken,
): EndraTool {
  return {
    name: "list_emails",
    description:
      'Lists recent Gmail messages, optionally filtered with a Gmail search query (e.g. "is:unread", "from:someone@example.com").',
    category: "productivity",
    riskLevel: "read",
    requiresConfirmation: false,
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Gmail search syntax, omit for the inbox as-is" },
        maxResults: { type: "integer", description: "Default 10" },
      },
      additionalProperties: false,
    },
    async execute(input) {
      const { query, maxResults } = input as { query?: string; maxResults?: number };
      const accessToken = await getAccessToken();
      const listUrl = new URL(`${GMAIL_BASE}/messages`);
      if (query) listUrl.searchParams.set("q", query);
      listUrl.searchParams.set("maxResults", String(maxResults ?? 10));

      const listResponse = await fetch(listUrl, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!listResponse.ok) {
        return { success: false, error: `Gmail request failed: ${listResponse.status}` };
      }
      const list = (await listResponse.json()) as { messages?: { id: string }[] };

      const emails = await Promise.all(
        (list.messages ?? []).map(async (m) => {
          const metaUrl = new URL(`${GMAIL_BASE}/messages/${m.id}`);
          metaUrl.searchParams.set("format", "metadata");
          metaUrl.searchParams.append("metadataHeaders", "Subject");
          metaUrl.searchParams.append("metadataHeaders", "From");
          metaUrl.searchParams.append("metadataHeaders", "Date");
          const metaResponse = await fetch(metaUrl, {
            headers: { Authorization: `Bearer ${accessToken}` },
          });
          const meta = (await metaResponse.json()) as {
            id: string;
            snippet?: string;
            payload?: { headers?: { name: string; value: string }[] };
          };
          return {
            id: meta.id,
            subject: headerValue(meta.payload?.headers, "Subject"),
            from: headerValue(meta.payload?.headers, "From"),
            date: headerValue(meta.payload?.headers, "Date"),
            snippet: meta.snippet,
          };
        }),
      );
      return { success: true, data: emails };
    },
  };
}

// read-risk, no confirmation - reads one message's full plain-text body.
export function createReadEmailTool(
  getAccessToken: typeof getGoogleAccessToken = getGoogleAccessToken,
): EndraTool {
  return {
    name: "read_email",
    description:
      "Reads the full content of one Gmail message by id (use list_emails first to find it).",
    category: "productivity",
    riskLevel: "read",
    requiresConfirmation: false,
    inputSchema: {
      type: "object",
      required: ["messageId"],
      properties: { messageId: { type: "string" } },
      additionalProperties: false,
    },
    async execute(input) {
      const { messageId } = input as { messageId: string };
      const accessToken = await getAccessToken();
      const url = new URL(`${GMAIL_BASE}/messages/${messageId}`);
      url.searchParams.set("format", "full");
      const response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
      if (!response.ok) {
        return { success: false, error: `Gmail request failed: ${response.status}` };
      }
      const message = (await response.json()) as {
        snippet?: string;
        payload?: GmailMessagePart & { headers?: { name: string; value: string }[] };
      };
      const body = message.payload ? findPlainTextBody(message.payload) : undefined;
      return {
        success: true,
        data: {
          subject: headerValue(message.payload?.headers, "Subject"),
          from: headerValue(message.payload?.headers, "From"),
          date: headerValue(message.payload?.headers, "Date"),
          body: body ?? message.snippet ?? "",
        },
      };
    },
  };
}

// critical-risk, always requires confirmation (CLAUDE.md section 6 -
// sending email is a named example of a critical action).
export function createSendEmailTool(
  getAccessToken: typeof getGoogleAccessToken = getGoogleAccessToken,
): EndraTool {
  return {
    name: "send_email",
    description: "Sends an email from the user's Gmail account.",
    category: "productivity",
    riskLevel: "critical",
    requiresConfirmation: true,
    inputSchema: {
      type: "object",
      required: ["to", "subject", "body"],
      properties: {
        to: { type: "string" },
        subject: { type: "string" },
        body: { type: "string" },
      },
      additionalProperties: false,
    },
    async execute(input) {
      const { to, subject, body } = input as { to: string; subject: string; body: string };
      const accessToken = await getAccessToken();
      const raw = base64UrlEncode(
        `To: ${to}\r\nSubject: ${encodeHeaderValue(subject)}\r\nContent-Type: text/plain; charset="UTF-8"\r\n\r\n${body}`,
      );
      const response = await fetch(`${GMAIL_BASE}/messages/send`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ raw }),
      });
      if (!response.ok) {
        return { success: false, error: `Gmail request failed: ${response.status}` };
      }
      const sent = (await response.json()) as { id: string };
      return { success: true, data: { sent: true, id: sent.id } };
    },
  };
}
