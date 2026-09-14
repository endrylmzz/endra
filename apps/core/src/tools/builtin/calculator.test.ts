import { describe, expect, it } from "vitest";
import { evaluateArithmetic, calculatorTool } from "./calculator.js";

describe("evaluateArithmetic", () => {
  it("evaluates simple addition", () => {
    expect(evaluateArithmetic("2 + 3")).toBe(5);
  });

  it("respects operator precedence", () => {
    expect(evaluateArithmetic("2 + 3 * 4")).toBe(14);
  });

  it("respects parentheses", () => {
    expect(evaluateArithmetic("(2 + 3) * 4")).toBe(20);
  });

  it("handles division and decimals", () => {
    expect(evaluateArithmetic("7 / 2")).toBe(3.5);
  });

  it("handles negative numbers", () => {
    expect(evaluateArithmetic("-5 + 10")).toBe(5);
  });

  it("throws on an unbalanced parenthesis", () => {
    expect(() => evaluateArithmetic("(2 + 3")).toThrow(/parenthesis/);
  });

  it("throws on trailing garbage", () => {
    expect(() => evaluateArithmetic("2 + 3 x")).toThrow();
  });

  it("throws instead of using eval - no code execution", () => {
    expect(() => evaluateArithmetic("console.log(1)")).toThrow();
  });
});

describe("calculatorTool", () => {
  it("is a read tool that never requires confirmation", () => {
    expect(calculatorTool.riskLevel).toBe("read");
    expect(calculatorTool.requiresConfirmation).toBe(false);
  });

  it("returns a success result for a valid expression", async () => {
    const result = await calculatorTool.execute(
      { expression: "2 + 2" },
      { userId: "u1", conversationId: "c1" },
    );
    expect(result).toEqual({ success: true, data: 4 });
  });

  it("returns a failure result (not a throw) for an invalid expression", async () => {
    const result = await calculatorTool.execute(
      { expression: "2 + " },
      { userId: "u1", conversationId: "c1" },
    );
    expect(result.success).toBe(false);
  });
});
