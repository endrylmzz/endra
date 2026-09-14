// Text embeddings for semantic memory (MEMORY-005). Separate from
// llm/openai-provider.ts because embeddings aren't part of the
// LLMProvider contract (a different OpenAI API, different concern).

import OpenAI from "openai";

const EMBEDDING_MODEL = "text-embedding-3-small";

let defaultClient: OpenAI | undefined;
function getDefaultClient(): OpenAI {
  defaultClient ??= new OpenAI();
  return defaultClient;
}

export async function embedText(
  text: string,
  client: OpenAI = getDefaultClient(),
): Promise<number[]> {
  const response = await client.embeddings.create({ model: EMBEDDING_MODEL, input: text });
  return response.data[0].embedding;
}
