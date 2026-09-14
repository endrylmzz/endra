import { describe, expect, it } from "vitest";
import { chunkMessage } from "./telegram-api.js";

describe("chunkMessage", () => {
  it("returns the text unchanged as a single chunk when under the limit", () => {
    expect(chunkMessage("merhaba", 10)).toEqual(["merhaba"]);
  });

  it("splits text longer than the limit into multiple chunks", () => {
    const result = chunkMessage("abcdefghij", 4);
    expect(result).toEqual(["abcd", "efgh", "ij"]);
  });

  it("uses Telegram's 4096-character default limit", () => {
    const text = "a".repeat(5000);
    const result = chunkMessage(text);
    expect(result).toHaveLength(2);
    expect(result[0]).toHaveLength(4096);
    expect(result[1]).toHaveLength(904);
  });
});
