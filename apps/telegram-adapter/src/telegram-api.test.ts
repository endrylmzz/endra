import { describe, expect, it, vi, afterEach } from "vitest";
import { chunkMessage, TelegramClient } from "./telegram-api.js";

function jsonResponse(body: unknown) {
  return { json: async () => body };
}

describe("chunkMessage", () => {
  it("returns the text unchanged as a single chunk when under the limit", () => {
    expect(chunkMessage("merhaba", 10)).toEqual(["merhaba"]);
  });

  it("splits text longer than the limit into multiple chunks", () => {
    const result = chunkMessage("abcdefghij", 4);
    expect(result).toEqual(["abcd", "efgh", "ij"]);
  });

  it("uses Telegram's 4096-character default limit", () => {
    const text = "a".repeat(5000);
    const result = chunkMessage(text);
    expect(result).toHaveLength(2);
    expect(result[0]).toHaveLength(4096);
    expect(result[1]).toHaveLength(904);
  });
});

describe("TelegramClient.sendMessage", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends with Markdown parse_mode by default", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ ok: true, result: {} }));
    vi.stubGlobal("fetch", fetchMock);

    await new TelegramClient("test-token").sendMessage(42, "**merhaba**");

    const [, options] = fetchMock.mock.calls[0] as [string, { body: string }];
    expect(JSON.parse(options.body)).toEqual({
      chat_id: 42,
      text: "**merhaba**",
      parse_mode: "Markdown",
    });
  });

  it("falls back to plain text if Telegram rejects the Markdown", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ ok: false, description: "can't parse entities" }))
      .mockResolvedValueOnce(jsonResponse({ ok: true, result: {} }));
    vi.stubGlobal("fetch", fetchMock);

    await new TelegramClient("test-token").sendMessage(42, "*broken");

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [, secondOptions] = fetchMock.mock.calls[1] as [string, { body: string }];
    expect(JSON.parse(secondOptions.body)).toEqual({ chat_id: 42, text: "*broken" });
  });
});
