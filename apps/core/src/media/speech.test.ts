import { describe, expect, it, vi } from "vitest";
import type OpenAI from "openai";
import { synthesizeSpeech } from "./speech.js";

describe("synthesizeSpeech", () => {
  it("returns the generated audio as base64 and requests opus format", async () => {
    const fakeBytes = Buffer.from("fake opus bytes");
    const create = vi.fn().mockResolvedValue({
      arrayBuffer: async () =>
        fakeBytes.buffer.slice(fakeBytes.byteOffset, fakeBytes.byteOffset + fakeBytes.byteLength),
    });
    const client = { audio: { speech: { create } } } as unknown as OpenAI;

    const result = await synthesizeSpeech("merhaba Ender", client);

    expect(result).toBe(fakeBytes.toString("base64"));
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ input: "merhaba Ender", response_format: "opus" }),
    );
  });
});
