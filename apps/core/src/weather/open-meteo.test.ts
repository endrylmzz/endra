import { describe, expect, it, vi, afterEach } from "vitest";
import { describeWeatherCode, fetchCurrentWeather, isPrecipitating } from "./open-meteo.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

function jsonResponse(body: unknown, ok = true) {
  return { ok, status: ok ? 200 : 500, json: async () => body };
}

describe("fetchCurrentWeather", () => {
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

    const result = await fetchCurrentWeather("Istanbul");

    expect(result).toEqual({
      city: "İstanbul",
      country: "Türkiye Cumhuriyeti",
      temperatureC: 18.2,
      humidityPercent: 89,
      windSpeedKmh: 5.6,
      weatherCode: 2,
      condition: "parçalı bulutlu",
    });
    expect(fetchMock.mock.calls[0][0]).toContain("geocoding-api.open-meteo.com");
    expect(fetchMock.mock.calls[1][0]).toContain("api.open-meteo.com/v1/forecast");
  });

  it("throws when no matching city is found", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ results: [] })));

    await expect(fetchCurrentWeather("asdkjaslkdj")).rejects.toThrow("bulunamadı");
  });

  it("throws when the geocoding request fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({}, false)));

    await expect(fetchCurrentWeather("Istanbul")).rejects.toThrow("Geocoding request failed");
  });

  it("throws when the forecast request fails", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ results: [{ name: "X", latitude: 1, longitude: 1 }] }))
      .mockResolvedValueOnce(jsonResponse({}, false));
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchCurrentWeather("X")).rejects.toThrow("Forecast request failed");
  });
});

describe("describeWeatherCode", () => {
  it("falls back to a placeholder for an unmapped code", () => {
    expect(describeWeatherCode(9999)).toContain("9999");
  });

  it("describes a known code", () => {
    expect(describeWeatherCode(0)).toBe("açık");
  });
});

describe("isPrecipitating", () => {
  it("treats rain/snow/storm codes as precipitating", () => {
    expect(isPrecipitating(61)).toBe(true);
    expect(isPrecipitating(75)).toBe(true);
    expect(isPrecipitating(95)).toBe(true);
  });

  it("does not treat clear, cloudy, or fog codes as precipitating", () => {
    expect(isPrecipitating(0)).toBe(false);
    expect(isPrecipitating(3)).toBe(false);
    expect(isPrecipitating(45)).toBe(false);
  });
});
