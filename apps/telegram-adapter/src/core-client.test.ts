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

    expect(result).toBe("Merhaba Ender.");
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
