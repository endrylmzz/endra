import { describe, expect, it, vi } from "vitest";
import type OpenAI from "openai";
import { embedText } from "./embeddings.js";

describe("embedText", () => {
  it("returns the embedding vector from the response", async () => {
    const create = vi.fn().mockResolvedValue({ data: [{ embedding: [0.1, 0.2, 0.3] }] });
    const client = { embeddings: { create } } as unknown as OpenAI;

    const result = await embedText("merhaba", client);

    expect(result).toEqual([0.1, 0.2, 0.3]);
    expect(create).toHaveBeenCalledWith({ model: "text-embedding-3-small", input: "merhaba" });
  });
});
