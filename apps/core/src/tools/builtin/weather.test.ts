import { describe, expect, it, vi, afterEach } from "vitest";
import { weatherTool } from "./weather.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

function jsonResponse(body: unknown, ok = true) {
  return { ok, status: ok ? 200 : 500, json: async () => body };
}

describe("weatherTool", () => {
  it("is a read tool that never requires confirmation", () => {
    expect(weatherTool.riskLevel).toBe("read");
    expect(weatherTool.requiresConfirmation).toBe(false);
  });

  it("returns the current weather for a city", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          results: [
            { name: "İstanbul", country: "Türkiye Cumhuriyeti", latitude: 41.01, longitude: 28.95 },
          ],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          current: {
            temperature_2m: 18.2,
            relative_humidity_2m: 89,
            weather_code: 2,
            wind_speed_10m: 5.6,
          },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const result = await weatherTool.execute(
      { city: "Istanbul" },
      { userId: "u", conversationId: "c" },
    );

    expect(result).toEqual({
      success: true,
      data: {
        city: "İstanbul",
        country: "Türkiye Cumhuriyeti",
        temperatureC: 18.2,
        humidityPercent: 89,
        windSpeedKmh: 5.6,
        weatherCode: 2,
        condition: "parçalı bulutlu",
      },
    });
  });

  it("converts a lookup failure into a failure result", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ results: [] })));

    const result = await weatherTool.execute(
      { city: "asdkjaslkdj" },
      { userId: "u", conversationId: "c" },
    );

    expect(result.success).toBe(false);
  });
});
