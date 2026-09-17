import type { EndraTool } from "@endra/agent-contracts";

// Partial, key-free coverage of TOOLS-002 (web research) - factual
// lookups via Wikipedia's free REST API. Not a general web search (no
// key-free general search API exists); that gap stays open until a
// paid search API key is available.
const SEARCH_BASE = "https://tr.wikipedia.org/w/api.php";
const SUMMARY_BASE = "https://tr.wikipedia.org/api/rest_v1/page/summary";

interface SearchResult {
  title: string;
}

interface PageSummary {
  title: string;
  extract: string;
  content_urls?: { desktop?: { page?: string } };
}

export const wikipediaSearchTool: EndraTool = {
  name: "search_wikipedia",
  description:
    "Looks up a factual summary of a topic on Turkish Wikipedia (free, no API key). Good for 'kim/nedir/ne zaman' style factual questions - not a general web search.",
  category: "research",
  riskLevel: "read",
  requiresConfirmation: false,
  inputSchema: {
    type: "object",
    required: ["query"],
    properties: { query: { type: "string", description: 'e.g. "Mustafa Kemal Atatürk"' } },
    additionalProperties: false,
  },
  async execute(input) {
    const { query } = input as { query: string };

    const searchUrl = `${SEARCH_BASE}?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json&srlimit=1`;
    const searchResponse = await fetch(searchUrl);
    if (!searchResponse.ok) {
      return { success: false, error: `Wikipedia search failed: ${searchResponse.status}` };
    }
    const searchData = (await searchResponse.json()) as { query?: { search?: SearchResult[] } };
    const title = searchData.query?.search?.[0]?.title;
    if (!title) {
      return { success: false, error: `"${query}" için Wikipedia'da bir sonuç bulunamadı` };
    }

    const summaryUrl = `${SUMMARY_BASE}/${encodeURIComponent(title)}`;
    const summaryResponse = await fetch(summaryUrl);
    if (!summaryResponse.ok) {
      return {
        success: false,
        error: `Wikipedia summary request failed: ${summaryResponse.status}`,
      };
    }
    const summary = (await summaryResponse.json()) as PageSummary;

    return {
      success: true,
      data: {
        title: summary.title,
        extract: summary.extract,
        url: summary.content_urls?.desktop?.page,
      },
    };
  },
};
