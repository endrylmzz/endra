import { describe, expect, it, vi, afterEach } from "vitest";
import { cryptoPriceTool } from "./crypto-price.js";

describe("cryptoPriceTool", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("is a read tool that never requires confirmation", () => {
    expect(cryptoPriceTool.riskLevel).toBe("read");
    expect(cryptoPriceTool.requiresConfirmation).toBe(false);
  });

  it("fetches prices from CoinGecko and returns them", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ bitcoin: { usd: 79000, try: 3800000 } }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await cryptoPriceTool.execute(
      { coinIds: ["bitcoin"], vsCurrencies: ["usd", "try"] },
      { userId: "u1", conversationId: "c1" },
    );

    expect(result).toEqual({ success: true, data: { bitcoin: { usd: 79000, try: 3800000 } } });
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("ids=bitcoin&vs_currencies=usd%2Ctry"),
    );
  });

  it("returns a failure result when the coin id doesn't match anything", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }));

    const result = await cryptoPriceTool.execute(
      { coinIds: ["not-a-real-coin"], vsCurrencies: ["usd"] },
      { userId: "u1", conversationId: "c1" },
    );

    expect(result.success).toBe(false);
  });

  it("returns a failure result on a non-OK response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 429 }));

    const result = await cryptoPriceTool.execute(
      { coinIds: ["bitcoin"], vsCurrencies: ["usd"] },
      { userId: "u1", conversationId: "c1" },
    );

    expect(result.success).toBe(false);
  });
});
