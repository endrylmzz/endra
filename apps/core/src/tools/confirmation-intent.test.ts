import { describe, expect, it } from "vitest";
import { detectConfirmationIntent } from "./confirmation-intent.js";

describe("detectConfirmationIntent", () => {
  it("recognizes Turkish affirmative replies", () => {
    expect(detectConfirmationIntent("evet yap")).toBe("approve");
    expect(detectConfirmationIntent("Tamam.")).toBe("approve");
  });

  it("recognizes English affirmative replies", () => {
    expect(detectConfirmationIntent("yes please")).toBe("approve");
  });

  it("recognizes Turkish negative replies", () => {
    expect(detectConfirmationIntent("hayır yapma")).toBe("reject");
    expect(detectConfirmationIntent("iptal et")).toBe("reject");
  });

  it("recognizes English negative replies", () => {
    expect(detectConfirmationIntent("no, cancel that")).toBe("reject");
  });

  it("returns unclear for an unrelated message", () => {
    expect(detectConfirmationIntent("bugün hava nasıl?")).toBe("unclear");
  });

  it("returns unclear when both affirmative and negative words appear", () => {
    expect(detectConfirmationIntent("evet ama hayır aslında")).toBe("unclear");
  });
});
