import type { FastifyInstance } from "fastify";
import { ENDRA_CHANNELS, type EndraMessageRequest } from "@endra/agent-contracts";
import { handleMessage } from "../services/message-service.js";

const messageBodySchema = {
  type: "object",
  required: ["channel", "userId", "conversationId", "message"],
  additionalProperties: false,
  properties: {
    channel: { type: "string", enum: [...ENDRA_CHANNELS] },
    userId: { type: "string", minLength: 1 },
    conversationId: { type: "string", minLength: 1 },
    message: { type: "string", minLength: 1 },
  },
};

export async function registerMessageRoute(app: FastifyInstance): Promise<void> {
  app.post<{ Body: EndraMessageRequest }>(
    "/message",
    { schema: { body: messageBodySchema } },
    async (request) => {
      const data = handleMessage(request.body);
      return { success: true, data };
    },
  );
}
