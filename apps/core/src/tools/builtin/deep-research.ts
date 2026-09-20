import type { EndraTool } from "@endra/agent-contracts";
import type { LLMProvider } from "@endra/agent-contracts";
import { searchWeb } from "./web-search.js";
import { OpenAIProvider } from "../../llm/openai-provider.js";

// A single web_search call already lets the model run its own search(es)
// internally, but it doesn't decompose a broad/comparative question into
// focused angles first. This tool adds that step: break the topic into a
// few sub-questions, research each independently, then synthesize one
// coherent report - genuinely multi-step, unlike the one-shot web_search
// tool, without needing a second LLM provider or a bespoke agent loop.

const MAX_SUBQUESTIONS = 4;
// A synthesized report from several findings runs well past the
// providers' default 1024-token budget (confirmed live - it was
// truncated mid-sentence at the default).
const SYNTHESIS_MAX_TOKENS = 4096;

const DECOMPOSE_SYSTEM_PROMPT = `Kullanıcı bir araştırma konusu verdi. Bu konuyu, web'de ayrı ayrı araştırılabilecek 2 ila ${MAX_SUBQUESTIONS} odaklı alt soruya böl. Konu zaten dar/spesifikse tek bir soru yeterli olabilir.

Yanıtını SADECE bir JSON string dizisi olarak ver, başka hiçbir şey yazma. Örnek: ["soru 1", "soru 2"]`;

const SYNTHESIZE_SYSTEM_PROMPT = `Aşağıda bir araştırma konusu ve bu konunun alt sorularına yapılan web araştırmalarının bulguları var. Bunları tek, tutarlı, iyi organize edilmiş bir Türkçe rapora dönüştür. Alt soruları ayrı ayrı tekrarlama - bulguları sentezle. Kaynak/atıf bilgisi bulgularda geçiyorsa koru.`;

let defaultProvider: OpenAIProvider | undefined;
function getDefaultProvider(): OpenAIProvider {
  defaultProvider ??= new OpenAIProvider();
  return defaultProvider;
}

export async function decomposeTopic(llm: LLMProvider, topic: string): Promise<string[]> {
  const response = await llm.generate({
    systemPrompt: DECOMPOSE_SYSTEM_PROMPT,
    messages: [{ role: "user", content: topic }],
  });
  try {
    const parsed: unknown = JSON.parse(response.content);
    if (Array.isArray(parsed) && parsed.length > 0 && parsed.every((q) => typeof q === "string")) {
      return (parsed as string[]).slice(0, MAX_SUBQUESTIONS);
    }
  } catch {
    // fall through to the single-question fallback below
  }
  return [topic];
}

export interface ResearchFinding {
  question: string;
  answer: string;
}

export async function synthesizeReport(
  llm: LLMProvider,
  topic: string,
  findings: ResearchFinding[],
): Promise<string> {
  const response = await llm.generate({
    systemPrompt: SYNTHESIZE_SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `Konu: ${topic}\n\n${findings
          .map((f) => `Alt soru: ${f.question}\nBulgular: ${f.answer}`)
          .join("\n\n")}`,
      },
    ],
    maxTokens: SYNTHESIS_MAX_TOKENS,
  });
  return response.content;
}

export function createDeepResearchTool(
  llm: LLMProvider = getDefaultProvider(),
  search: typeof searchWeb = searchWeb,
): EndraTool {
  return {
    name: "deep_research",
    description:
      "Runs a multi-step research process on a broad or comparative topic: breaks it into focused sub-questions, searches the web for each, then synthesizes one coherent report. Slower than web_search - use for genuinely broad questions ('compare X and Y', 'what's the state of Z'), not quick facts.",
    category: "research",
    riskLevel: "read",
    requiresConfirmation: false,
    inputSchema: {
      type: "object",
      required: ["topic"],
      properties: { topic: { type: "string" } },
      additionalProperties: false,
    },
    async execute(input) {
      const { topic } = input as { topic: string };
      const subQuestions = await decomposeTopic(llm, topic);
      const findings = await Promise.all(
        subQuestions.map(async (question): Promise<ResearchFinding> => ({
          question,
          answer: await search(question),
        })),
      );
      const report = await synthesizeReport(llm, topic, findings);
      return { success: true, data: { report, subQuestions } };
    },
  };
}
