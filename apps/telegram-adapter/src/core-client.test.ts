import { describe, expect, it, vi, afterEach } from "vitest";
import { callCore } from "./core-client.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("callCore", () => {
  it("returns the reply message on success", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      json: async () => ({ success: true, data: { message: "Merhaba Ender." } }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await callCore(
      { userId: "1", conversationId: "1", message: "merhaba" },
      "http://localhost:3000",
    );

    expect(result).toEqual({ message: "Merhaba Ender." });
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:3000/api/v1/message",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          channel: "telegram",
          userId: "1",
          conversationId: "1",
          message: "merhaba",
        }),
      }),
    );
  });

  it("sends attachments and returns any attachments in the response", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      json: async () => ({
        success: true,
        data: {
          message: "İşte görsel!",
          attachments: [{ type: "image", data: "AAAA", mimeType: "image/png" }],
        },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await callCore(
      {
        userId: "1",
        conversationId: "1",
        message: "",
        attachments: [{ type: "audio", data: "ZmFrZQ==", mimeType: "audio/ogg" }],
      },
      "http://localhost:3000",
    );

    expect(result).toEqual({
      message: "İşte görsel!",
      attachments: [{ type: "image", data: "AAAA", mimeType: "image/png" }],
    });
    const [, options] = fetchMock.mock.calls[0] as [string, { body: string }];
    expect(JSON.parse(options.body).attachments).toEqual([
      { type: "audio", data: "ZmFrZQ==", mimeType: "audio/ogg" },
    ]);
  });

  it("throws with Core's error message when the response is unsuccessful", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        json: async () => ({ success: false, error: { message: "boom" } }),
      }),
    );

    await expect(
      callCore({ userId: "1", conversationId: "1", message: "hi" }, "http://localhost:3000"),
    ).rejects.toThrow("boom");
  });
});
