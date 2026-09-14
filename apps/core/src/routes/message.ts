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
    // Can be empty when the request is just a voice note or a photo
    // with no caption - see the "anyOf" below.
    message: { type: "string" },
    attachments: {
      type: "array",
      items: {
        type: "object",
        required: ["type", "data", "mimeType"],
        additionalProperties: false,
        properties: {
          type: { type: "string", enum: ["audio", "image"] },
          data: { type: "string", minLength: 1 },
          mimeType: { type: "string", minLength: 1 },
        },
      },
    },
  },
  // Require either a non-empty message or at least one attachment.
  anyOf: [
    { properties: { message: { type: "string", minLength: 1 } } },
    { required: ["attachments"], properties: { attachments: { type: "array", minItems: 1 } } },
  ],
};

export async function registerMessageRoute(app: FastifyInstance): Promise<void> {
  app.post<{ Body: EndraMessageRequest }>(
    "/message",
    { schema: { body: messageBodySchema } },
    async (request) => {
      const data = await handleMessage(request.body);
      return { success: true, data };
    },
  );
}
