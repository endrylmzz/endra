import { describe, expect, it, vi, afterEach } from "vitest";
import { currencyConversionTool } from "./currency-conversion.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

function jsonResponse(body: unknown, ok = true) {
  return { ok, status: ok ? 200 : 500, json: async () => body };
}

describe("currencyConversionTool", () => {
  it("is a read tool that never requires confirmation", () => {
    expect(currencyConversionTool.riskLevel).toBe("read");
    expect(currencyConversionTool.requiresConfirmation).toBe(false);
  });

  it("converts using the returned rate and uppercases currency codes", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ date: "2026-09-17", rates: { TRY: 4867.5 } }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await currencyConversionTool.execute(
      { amount: 100, from: "usd", to: "try" },
      { userId: "u", conversationId: "c" },
    );

    expect(result).toEqual({
      success: true,
      data: { amount: 100, from: "USD", to: "TRY", result: 4867.5, date: "2026-09-17" },
    });
    expect(fetchMock.mock.calls[0][0]).toContain("base=USD");
    expect(fetchMock.mock.calls[0][0]).toContain("symbols=TRY");
  });

  it("returns a failure when the target currency code is unknown", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse({ date: "2026-09-17", rates: {} })),
    );

    const result = await currencyConversionTool.execute(
      { amount: 100, from: "USD", to: "ZZZ" },
      { userId: "u", conversationId: "c" },
    );

    expect(result.success).toBe(false);
  });

  it("returns a failure when the request itself fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({}, false)));

    const result = await currencyConversionTool.execute(
      { amount: 100, from: "USD", to: "TRY" },
      { userId: "u", conversationId: "c" },
    );

    expect(result.success).toBe(false);
  });
});
