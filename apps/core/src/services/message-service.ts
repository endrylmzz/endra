// Business logic for handling an inbound ENDRA message, kept separate from
// the Fastify route so it can grow into a real Core pipeline (identity,
// memory, LLM, tools) without touching the HTTP layer.

import type { EndraMessageRequest, EndraMessageResponseData } from "@endra/agent-contracts";

export function handleMessage(request: EndraMessageRequest): EndraMessageResponseData {
  return {
    message: "ENDRA Core is running.",
    conversationId: request.conversationId,
  };
}
