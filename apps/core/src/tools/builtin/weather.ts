import type { EndraTool } from "@endra/agent-contracts";

// TOOLS-001: Open-Meteo - free, no API key required (unlike most
// weather providers), which is why this could be built key-free.
const GEOCODING_BASE = "https://geocoding-api.open-meteo.com/v1/search";
const FORECAST_BASE = "https://api.open-meteo.com/v1/forecast";

// WMO weather interpretation codes (the fixed enum Open-Meteo returns) -
// https://open-meteo.com/en/docs
const WEATHER_CODE_DESCRIPTIONS: Record<number, string> = {
  0: "açık",
  1: "genelde açık",
  2: "parçalı bulutlu",
  3: "kapalı",
  45: "sisli",
  48: "kırağı sisi",
  51: "hafif çisenti",
  53: "orta çisenti",
  55: "yoğun çisenti",
  56: "hafif dondurucu çisenti",
  57: "yoğun dondurucu çisenti",
  61: "hafif yağmurlu",
  63: "orta şiddette yağmurlu",
  65: "şiddetli yağmurlu",
  66: "hafif dondurucu yağmur",
  67: "şiddetli dondurucu yağmur",
  71: "hafif kar yağışlı",
  73: "orta şiddette kar yağışlı",
  75: "yoğun kar yağışlı",
  77: "kar taneli",
  80: "hafif sağanak yağışlı",
  81: "orta şiddette sağanak yağışlı",
  82: "şiddetli sağanak yağışlı",
  85: "hafif kar sağanağı",
  86: "yoğun kar sağanağı",
  95: "gök gürültülü fırtına",
  96: "hafif dolulu fırtına",
  99: "şiddetli dolulu fırtına",
};

function describeWeatherCode(code: number): string {
  return WEATHER_CODE_DESCRIPTIONS[code] ?? `bilinmeyen hava kodu (${code})`;
}

interface GeocodingResult {
  name: string;
  country?: string;
  latitude: number;
  longitude: number;
}

export const weatherTool: EndraTool = {
  name: "get_weather",
  description:
    'Gets the current weather for a city (Open-Meteo, no API key needed). Give a plain city name, e.g. "Istanbul" or "Ankara".',
  category: "information",
  riskLevel: "read",
  requiresConfirmation: false,
  inputSchema: {
    type: "object",
    required: ["city"],
    properties: { city: { type: "string", description: 'e.g. "Istanbul"' } },
    additionalProperties: false,
  },
  async execute(input) {
    const { city } = input as { city: string };

    const geoUrl = `${GEOCODING_BASE}?name=${encodeURIComponent(city)}&count=1&language=tr`;
    const geoResponse = await fetch(geoUrl);
    if (!geoResponse.ok) {
      return { success: false, error: `Geocoding request failed: ${geoResponse.status}` };
    }
    const geoData = (await geoResponse.json()) as { results?: GeocodingResult[] };
    const place = geoData.results?.[0];
    if (!place) {
      return { success: false, error: `"${city}" adında bir şehir bulunamadı` };
    }

    const forecastUrl = `${FORECAST_BASE}?latitude=${place.latitude}&longitude=${place.longitude}&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m&timezone=auto`;
    const forecastResponse = await fetch(forecastUrl);
    if (!forecastResponse.ok) {
      return { success: false, error: `Forecast request failed: ${forecastResponse.status}` };
    }
    const forecastData = (await forecastResponse.json()) as {
      current: {
        temperature_2m: number;
        relative_humidity_2m: number;
        weather_code: number;
        wind_speed_10m: number;
      };
    };

    return {
      success: true,
      data: {
        city: place.name,
        country: place.country,
        temperatureC: forecastData.current.temperature_2m,
        humidityPercent: forecastData.current.relative_humidity_2m,
        windSpeedKmh: forecastData.current.wind_speed_10m,
        condition: describeWeatherCode(forecastData.current.weather_code),
      },
    };
  },
};
