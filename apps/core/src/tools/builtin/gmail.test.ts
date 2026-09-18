import { describe, expect, it, vi, afterEach } from "vitest";
import { createListEmailsTool, createReadEmailTool, createSendEmailTool } from "./gmail.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

const getAccessToken = vi.fn(async () => "access-token");

function jsonResponse(body: unknown, ok = true) {
  return { ok, status: ok ? 200 : 500, json: async () => body };
}

describe("createListEmailsTool", () => {
  it("is a read tool that never requires confirmation", () => {
    const tool = createListEmailsTool(getAccessToken);
    expect(tool.riskLevel).toBe("read");
    expect(tool.requiresConfirmation).toBe(false);
  });

  it("lists messages with subject/from/date/snippet", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ messages: [{ id: "m1" }] }))
      .mockResolvedValueOnce(
        jsonResponse({
          id: "m1",
          snippet: "merhaba...",
          payload: {
            headers: [
              { name: "Subject", value: "Toplantı" },
              { name: "From", value: "a@b.com" },
              { name: "Date", value: "Mon, 1 Sep 2026 10:00:00 +0300" },
            ],
          },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);
    const tool = createListEmailsTool(getAccessToken);

    const result = await tool.execute({}, { userId: "u", conversationId: "c" });

    expect(result).toEqual({
      success: true,
      data: [
        {
          id: "m1",
          subject: "Toplantı",
          from: "a@b.com",
          date: "Mon, 1 Sep 2026 10:00:00 +0300",
          snippet: "merhaba...",
        },
      ],
    });
  });

  it("returns a failure when the list request fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({}, false)));
    const tool = createListEmailsTool(getAccessToken);

    const result = await tool.execute({}, { userId: "u", conversationId: "c" });

    expect(result.success).toBe(false);
  });
});

describe("createReadEmailTool", () => {
  it("is a read tool that never requires confirmation", () => {
    const tool = createReadEmailTool(getAccessToken);
    expect(tool.riskLevel).toBe("read");
    expect(tool.requiresConfirmation).toBe(false);
  });

  it("decodes the plain-text body from the message payload", async () => {
    const encoded = Buffer.from("merhaba, nasılsın?", "utf-8")
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({
          snippet: "merhaba",
          payload: {
            headers: [
              { name: "Subject", value: "Selam" },
              { name: "From", value: "a@b.com" },
            ],
            mimeType: "text/plain",
            body: { data: encoded },
          },
        }),
      ),
    );
    const tool = createReadEmailTool(getAccessToken);

    const result = await tool.execute({ messageId: "m1" }, { userId: "u", conversationId: "c" });

    expect(result).toEqual({
      success: true,
      data: { subject: "Selam", from: "a@b.com", date: "", body: "merhaba, nasılsın?" },
    });
  });

  it("finds the plain-text part nested inside a multipart payload", async () => {
    const encoded = Buffer.from("iç metin", "utf-8")
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({
          snippet: "fallback",
          payload: {
            headers: [],
            mimeType: "multipart/alternative",
            parts: [
              { mimeType: "text/html", body: { data: "aGVsbG8=" } },
              { mimeType: "text/plain", body: { data: encoded } },
            ],
          },
        }),
      ),
    );
    const tool = createReadEmailTool(getAccessToken);

    const result = await tool.execute({ messageId: "m1" }, { userId: "u", conversationId: "c" });

    expect((result as { data: { body: string } }).data.body).toBe("iç metin");
  });
});

describe("createSendEmailTool", () => {
  it("is a critical tool that always requires confirmation", () => {
    const tool = createSendEmailTool(getAccessToken);
    expect(tool.riskLevel).toBe("critical");
    expect(tool.requiresConfirmation).toBe(true);
  });

  it("sends a base64url-encoded raw message", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ id: "sent-1" }));
    vi.stubGlobal("fetch", fetchMock);
    const tool = createSendEmailTool(getAccessToken);

    const result = await tool.execute(
      { to: "a@b.com", subject: "Selam", body: "merhaba" },
      { userId: "u", conversationId: "c" },
    );

    expect(result).toEqual({ success: true, data: { sent: true, id: "sent-1" } });
    const [, options] = fetchMock.mock.calls[0] as [string, { method: string; body: string }];
    expect(options.method).toBe("POST");
    const { raw } = JSON.parse(options.body) as { raw: string };
    expect(raw).not.toMatch(/[+/=]/);
  });

  it("returns a failure when the send request fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({}, false)));
    const tool = createSendEmailTool(getAccessToken);

    const result = await tool.execute(
      { to: "a@b.com", subject: "x", body: "y" },
      { userId: "u", conversationId: "c" },
    );

    expect(result.success).toBe(false);
  });

  it("RFC 2047-encodes a non-ASCII subject instead of embedding raw UTF-8 bytes in the header", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ id: "sent-1" }));
    vi.stubGlobal("fetch", fetchMock);
    const tool = createSendEmailTool(getAccessToken);

    await tool.execute(
      { to: "a@b.com", subject: "ENDRA canlı test", body: "merhaba" },
      { userId: "u", conversationId: "c" },
    );

    const [, options] = fetchMock.mock.calls[0] as [string, { body: string }];
    const { raw } = JSON.parse(options.body) as { raw: string };
    const decoded = Buffer.from(raw.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString(
      "utf-8",
    );
    const subjectLine = decoded.split("\r\n").find((line) => line.startsWith("Subject:")) ?? "";
    expect(subjectLine).toMatch(/^Subject: =\?UTF-8\?B\?/);
    const encodedPart = subjectLine.replace("Subject: =?UTF-8?B?", "").replace("?=", "");
    expect(Buffer.from(encodedPart, "base64").toString("utf-8")).toBe("ENDRA canlı test");
  });
});
