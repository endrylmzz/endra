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

  it("geocodes the city then returns the current weather", async () => {
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
        condition: "parçalı bulutlu",
      },
    });
    expect(fetchMock.mock.calls[0][0]).toContain("geocoding-api.open-meteo.com");
    expect(fetchMock.mock.calls[1][0]).toContain("api.open-meteo.com/v1/forecast");
  });

  it("returns a failure when no matching city is found", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ results: [] })));

    const result = await weatherTool.execute(
      { city: "asdkjaslkdj" },
      { userId: "u", conversationId: "c" },
    );

    expect(result.success).toBe(false);
  });

  it("returns a failure when the geocoding request fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({}, false)));

    const result = await weatherTool.execute(
      { city: "Istanbul" },
      { userId: "u", conversationId: "c" },
    );

    expect(result.success).toBe(false);
  });

  it("falls back to a placeholder description for an unmapped weather code", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ results: [{ name: "X", latitude: 1, longitude: 1 }] }))
      .mockResolvedValueOnce(
        jsonResponse({
          current: {
            temperature_2m: 20,
            relative_humidity_2m: 50,
            weather_code: 9999,
            wind_speed_10m: 1,
          },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const result = await weatherTool.execute({ city: "X" }, { userId: "u", conversationId: "c" });

    expect(result.success).toBe(true);
    expect((result as { data: { condition: string } }).data.condition).toContain("9999");
  });
});
