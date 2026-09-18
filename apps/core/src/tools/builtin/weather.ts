import type { EndraTool } from "@endra/agent-contracts";
import { fetchCurrentWeather } from "../../weather/open-meteo.js";

// TOOLS-001: Open-Meteo - free, no API key required (unlike most
// weather providers), which is why this could be built key-free.
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
    try {
      const weather = await fetchCurrentWeather(city);
      return { success: true, data: weather };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  },
};
