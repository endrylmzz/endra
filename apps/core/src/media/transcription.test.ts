import { describe, expect, it, vi } from "vitest";
import type OpenAI from "openai";
import { transcribeAudio } from "./transcription.js";

describe("transcribeAudio", () => {
  it("decodes the base64 audio and returns the transcribed text", async () => {
    const create = vi.fn().mockResolvedValue({ text: "merhaba endra" });
    const client = { audio: { transcriptions: { create } } } as unknown as OpenAI;

    const result = await transcribeAudio(
      Buffer.from("fake audio bytes").toString("base64"),
      "audio/ogg",
      client,
    );

    expect(result).toBe("merhaba endra");
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ model: "gpt-4o-transcribe" }));
  });
});
