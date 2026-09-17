import type { EndraTool } from "@endra/agent-contracts";

// Fiat currency conversion, complementing get_crypto_price (crypto
// only). Frankfurter serves ECB reference rates - free, no API key.
const FRANKFURTER_BASE = "https://api.frankfurter.dev/v1/latest";

export const currencyConversionTool: EndraTool = {
  name: "convert_currency",
  description:
    "Converts an amount between fiat currencies using ECB reference rates (no API key). For cryptocurrency prices, use get_crypto_price instead.",
  category: "finance",
  riskLevel: "read",
  requiresConfirmation: false,
  inputSchema: {
    type: "object",
    required: ["amount", "from", "to"],
    properties: {
      amount: { type: "number" },
      from: { type: "string", description: '3-letter currency code, e.g. "USD"' },
      to: { type: "string", description: '3-letter currency code, e.g. "TRY"' },
    },
    additionalProperties: false,
  },
  async execute(input) {
    const { amount, from, to } = input as { amount: number; from: string; to: string };
    const fromCode = from.toUpperCase();
    const toCode = to.toUpperCase();

    const url = `${FRANKFURTER_BASE}?amount=${amount}&base=${encodeURIComponent(fromCode)}&symbols=${encodeURIComponent(toCode)}`;
    const response = await fetch(url);
    if (!response.ok) {
      return { success: false, error: `Currency conversion request failed: ${response.status}` };
    }
    const data = (await response.json()) as { date: string; rates: Record<string, number> };
    const result = data.rates[toCode];
    if (result === undefined) {
      return { success: false, error: `No exchange rate found for ${fromCode} -> ${toCode}` };
    }

    return {
      success: true,
      data: { amount, from: fromCode, to: toCode, result, date: data.date },
    };
  },
};
