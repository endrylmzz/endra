import { describe, expect, it } from "vitest";
import { isAuthorized } from "./authorization.js";

describe("isAuthorized", () => {
  it("rejects everyone when the allowlist is unset", () => {
    expect(isAuthorized(12345, undefined)).toBe(false);
  });

  it("rejects everyone when the allowlist is empty", () => {
    expect(isAuthorized(12345, "")).toBe(false);
  });

  it("allows a user id present in the comma-separated allowlist", () => {
    expect(isAuthorized(12345, "111, 12345 ,999")).toBe(true);
  });

  it("rejects a user id not present in the allowlist", () => {
    expect(isAuthorized(12345, "111,999")).toBe(false);
  });
});
