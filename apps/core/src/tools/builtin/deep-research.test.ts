import { describe, expect, it, vi } from "vitest";
import type { LLMProvider } from "@endra/agent-contracts";
import { createDeepResearchTool, decomposeTopic, synthesizeReport } from "./deep-research.js";

function fakeLLM(content: string): LLMProvider {
  return {
    name: "fake",
    generate: vi.fn().mockResolvedValue({
      content,
      model: "fake-model",
      usage: { inputTokens: 1, outputTokens: 1 },
    }),
  };
}

describe("decomposeTopic", () => {
  it("parses a valid JSON array of sub-questions", async () => {
    const llm = fakeLLM('["soru 1", "soru 2"]');

    const result = await decomposeTopic(llm, "X ile Y'yi karşılaştır");

    expect(result).toEqual(["soru 1", "soru 2"]);
  });

  it("caps the number of sub-questions", async () => {
    const llm = fakeLLM('["1", "2", "3", "4", "5", "6"]');

    const result = await decomposeTopic(llm, "geniş bir konu");

    expect(result).toHaveLength(4);
  });

  it("falls back to the original topic as a single question when the response isn't a valid array", async () => {
    const llm = fakeLLM("bu bir JSON değil");

    const result = await decomposeTopic(llm, "dar bir konu");

    expect(result).toEqual(["dar bir konu"]);
  });

  it("falls back to the original topic when the array is empty", async () => {
    const llm = fakeLLM("[]");

    const result = await decomposeTopic(llm, "konu");

    expect(result).toEqual(["konu"]);
  });
});

describe("synthesizeReport", () => {
  it("passes the topic and findings to the model and returns its report", async () => {
    const llm = fakeLLM("Sentezlenmiş rapor metni.");

    const result = await synthesizeReport(llm, "konu", [{ question: "soru 1", answer: "cevap 1" }]);

    expect(result).toBe("Sentezlenmiş rapor metni.");
    expect(llm.generate).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: [expect.objectContaining({ content: expect.stringContaining("cevap 1") })],
        maxTokens: expect.any(Number),
      }),
    );
  });
});

describe("createDeepResearchTool", () => {
  it("is a read tool that never requires confirmation", () => {
    const tool = createDeepResearchTool(fakeLLM("[]"), vi.fn());
    expect(tool.riskLevel).toBe("read");
    expect(tool.requiresConfirmation).toBe(false);
  });

  it("decomposes the topic, searches each sub-question, then synthesizes a report", async () => {
    const generate = vi
      .fn()
      .mockResolvedValueOnce({
        content: '["alt soru 1", "alt soru 2"]',
        model: "fake-model",
        usage: { inputTokens: 1, outputTokens: 1 },
      })
      .mockResolvedValueOnce({
        content: "Nihai rapor.",
        model: "fake-model",
        usage: { inputTokens: 1, outputTokens: 1 },
      });
    const llm: LLMProvider = { name: "fake", generate };
    const search = vi.fn(async (q: string) => `cevap: ${q}`);
    const tool = createDeepResearchTool(llm, search);

    const result = await tool.execute(
      { topic: "X ile Y'yi karşılaştır" },
      { userId: "u", conversationId: "c" },
    );

    expect(search).toHaveBeenCalledWith("alt soru 1");
    expect(search).toHaveBeenCalledWith("alt soru 2");
    expect(result).toEqual({
      success: true,
      data: { report: "Nihai rapor.", subQuestions: ["alt soru 1", "alt soru 2"] },
    });
  });
});
