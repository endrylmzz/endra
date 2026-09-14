import { describe, expect, it, vi, afterEach } from "vitest";
import { deliverToTelegram } from "./deliver-telegram.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("deliverToTelegram", () => {
  it("posts the conversation id and message with the shared secret header", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    await deliverToTelegram("42", "hatırlatma zamanı", "http://localhost:3101/push", "s3cret");

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:3101/push",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ "X-Endra-Internal-Secret": "s3cret" }),
        body: JSON.stringify({ conversationId: "42", message: "hatırlatma zamanı" }),
      }),
    );
  });

  it("throws when the push endpoint responds with a non-2xx status", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 502 }));

    await expect(
      deliverToTelegram("42", "hi", "http://localhost:3101/push", "s3cret"),
    ).rejects.toThrow("502");
  });
});
