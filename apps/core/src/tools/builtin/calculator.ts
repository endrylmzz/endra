import type { EndraTool } from "@endra/agent-contracts";

// A tiny, safe recursive-descent arithmetic parser - no eval() on
// LLM-influenced input. Supports + - * / ( ) and decimals only.
export function evaluateArithmetic(expression: string): number {
  let pos = 0;

  function peek(): string {
    return expression[pos] ?? "";
  }

  function skipSpaces(): void {
    while (peek() === " ") pos++;
  }

  function parseNumber(): number {
    skipSpaces();
    const start = pos;
    if (peek() === "-") pos++;
    while (/[0-9.]/.test(peek())) pos++;
    if (pos === start || (pos === start + 1 && expression[start] === "-")) {
      throw new Error(`Expected a number at position ${start}`);
    }
    return Number(expression.slice(start, pos));
  }

  function parseFactor(): number {
    skipSpaces();
    if (peek() === "(") {
      pos++;
      const value = parseExpression();
      skipSpaces();
      if (peek() !== ")") throw new Error("Missing closing parenthesis");
      pos++;
      return value;
    }
    return parseNumber();
  }

  function parseTerm(): number {
    let value = parseFactor();
    for (;;) {
      skipSpaces();
      const op = peek();
      if (op !== "*" && op !== "/") return value;
      pos++;
      const rhs = parseFactor();
      value = op === "*" ? value * rhs : value / rhs;
    }
  }

  function parseExpression(): number {
    let value = parseTerm();
    for (;;) {
      skipSpaces();
      const op = peek();
      if (op !== "+" && op !== "-") return value;
      pos++;
      const rhs = parseTerm();
      value = op === "+" ? value + rhs : value - rhs;
    }
  }

  const result = parseExpression();
  skipSpaces();
  if (pos !== expression.length) {
    throw new Error(`Unexpected character at position ${pos}`);
  }
  return result;
}

export const calculatorTool: EndraTool = {
  name: "calculator",
  description: "Evaluates a basic arithmetic expression (+, -, *, /, parentheses).",
  category: "information",
  riskLevel: "read",
  requiresConfirmation: false,
  inputSchema: {
    type: "object",
    required: ["expression"],
    properties: { expression: { type: "string" } },
    additionalProperties: false,
  },
  async execute(input) {
    const { expression } = input as { expression: string };
    try {
      return { success: true, data: evaluateArithmetic(expression) };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  },
};
