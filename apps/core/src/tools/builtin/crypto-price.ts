import type { EndraTool } from "@endra/agent-contracts";

const COINGECKO_BASE = "https://api.coingecko.com/api/v3/simple/price";

export const cryptoPriceTool: EndraTool = {
  name: "get_crypto_price",
  description:
    "Gets the current price of one or more cryptocurrencies (CoinGecko ids, e.g. bitcoin, ethereum) in given fiat currencies (e.g. usd, try). No API key, free public data.",
  category: "finance",
  riskLevel: "read",
  requiresConfirmation: false,
  inputSchema: {
    type: "object",
    required: ["coinIds", "vsCurrencies"],
    properties: {
      coinIds: { type: "array", items: { type: "string" }, description: 'e.g. ["bitcoin"]' },
      vsCurrencies: {
        type: "array",
        items: { type: "string" },
        description: 'e.g. ["usd", "try"]',
      },
    },
    additionalProperties: false,
  },
  async execute(input) {
    const { coinIds, vsCurrencies } = input as { coinIds: string[]; vsCurrencies: string[] };
    const url = `${COINGECKO_BASE}?ids=${encodeURIComponent(coinIds.join(","))}&vs_currencies=${encodeURIComponent(vsCurrencies.join(","))}`;

    const response = await fetch(url);
    if (!response.ok) {
      return { success: false, error: `CoinGecko request failed: ${response.status}` };
    }
    const data = (await response.json()) as Record<string, Record<string, number>>;
    if (Object.keys(data).length === 0) {
      return { success: false, error: "No matching coin id found" };
    }
    return { success: true, data };
  },
};
