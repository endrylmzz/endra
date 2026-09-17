import { describe, expect, it, vi, afterEach } from "vitest";
import { wikipediaSearchTool } from "./wikipedia-search.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

function jsonResponse(body: unknown, ok = true) {
  return { ok, status: ok ? 200 : 500, json: async () => body };
}

describe("wikipediaSearchTool", () => {
  it("is a read tool that never requires confirmation", () => {
    expect(wikipediaSearchTool.riskLevel).toBe("read");
    expect(wikipediaSearchTool.requiresConfirmation).toBe(false);
  });

  it("searches then fetches the summary of the top result", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ query: { search: [{ title: "İstanbul" }] } }))
      .mockResolvedValueOnce(
        jsonResponse({
          title: "İstanbul",
          extract: "İstanbul, Türkiye'nin en kalabalık şehridir.",
          content_urls: { desktop: { page: "https://tr.wikipedia.org/wiki/%C4%B0stanbul" } },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const result = await wikipediaSearchTool.execute(
      { query: "Istanbul" },
      { userId: "u", conversationId: "c" },
    );

    expect(result).toEqual({
      success: true,
      data: {
        title: "İstanbul",
        extract: "İstanbul, Türkiye'nin en kalabalık şehridir.",
        url: "https://tr.wikipedia.org/wiki/%C4%B0stanbul",
      },
    });
    expect(fetchMock.mock.calls[0][0]).toContain("action=query");
    expect(fetchMock.mock.calls[1][0]).toContain("rest_v1/page/summary");
  });

  it("returns a failure when nothing matches the query", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ query: { search: [] } })));

    const result = await wikipediaSearchTool.execute(
      { query: "asdkjaslkdjqwe" },
      { userId: "u", conversationId: "c" },
    );

    expect(result.success).toBe(false);
  });

  it("returns a failure when the search request itself fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({}, false)));

    const result = await wikipediaSearchTool.execute(
      { query: "Istanbul" },
      { userId: "u", conversationId: "c" },
    );

    expect(result.success).toBe(false);
  });
});
