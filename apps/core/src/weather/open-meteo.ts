// Shared Open-Meteo client - free, no API key. Used by both the
// get_weather tool and the weather-alert monitor, so it lives outside
// tools/ and proactive/ rather than being owned by either.

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

// Any code that means some form of precipitation is falling right now
// (drizzle, rain, snow, showers, thunderstorm) - used by the
// "precipitation" weather-alert kind. Fog (45/48) is deliberately not
// included - it's not precipitation.
const PRECIPITATION_CODES = new Set([
  51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 71, 73, 75, 77, 80, 81, 82, 85, 86, 95, 96, 99,
]);

export function describeWeatherCode(code: number): string {
  return WEATHER_CODE_DESCRIPTIONS[code] ?? `bilinmeyen hava kodu (${code})`;
}

export function isPrecipitating(code: number): boolean {
  return PRECIPITATION_CODES.has(code);
}

export interface CurrentWeather {
  city: string;
  country?: string;
  temperatureC: number;
  humidityPercent: number;
  windSpeedKmh: number;
  weatherCode: number;
  condition: string;
}

interface GeocodingResult {
  name: string;
  country?: string;
  latitude: number;
  longitude: number;
}

/** Throws on any failure - geocoding miss, HTTP error, etc. */
export async function fetchCurrentWeather(city: string): Promise<CurrentWeather> {
  const geoUrl = `${GEOCODING_BASE}?name=${encodeURIComponent(city)}&count=1&language=tr`;
  const geoResponse = await fetch(geoUrl);
  if (!geoResponse.ok) {
    throw new Error(`Geocoding request failed: ${geoResponse.status}`);
  }
  const geoData = (await geoResponse.json()) as { results?: GeocodingResult[] };
  const place = geoData.results?.[0];
  if (!place) {
    throw new Error(`"${city}" adında bir şehir bulunamadı`);
  }

  const forecastUrl = `${FORECAST_BASE}?latitude=${place.latitude}&longitude=${place.longitude}&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m&timezone=auto`;
  const forecastResponse = await fetch(forecastUrl);
  if (!forecastResponse.ok) {
    throw new Error(`Forecast request failed: ${forecastResponse.status}`);
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
    city: place.name,
    country: place.country,
    temperatureC: forecastData.current.temperature_2m,
    humidityPercent: forecastData.current.relative_humidity_2m,
    windSpeedKmh: forecastData.current.wind_speed_10m,
    weatherCode: forecastData.current.weather_code,
    condition: describeWeatherCode(forecastData.current.weather_code),
  };
}
