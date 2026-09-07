import { randomUUID } from "node:crypto";
import Fastify, {
  type FastifyError,
  type FastifyInstance,
  type FastifyServerOptions,
} from "fastify";
import type { EndraErrorResponse } from "@endra/agent-contracts";
import { registerHealthRoute } from "./routes/health.js";
import { registerMessageRoute } from "./routes/message.js";

export function buildApp(overrides: FastifyServerOptions = {}): FastifyInstance {
  const app = Fastify({
    logger: true,
    genReqId: () => randomUUID(),
    // Fastify's default ajv config silently strips unknown body properties,
    // which would defeat our `additionalProperties: false` schemas.
    ajv: { customOptions: { removeAdditional: false } },
    ...overrides,
  });

  app.setErrorHandler((error: FastifyError, request, reply) => {
    request.log.error({ err: error }, "request failed");

    if (error.validation) {
      const body: EndraErrorResponse = {
        success: false,
        error: { code: "VALIDATION_ERROR", message: error.message },
      };
      reply.status(400).send(body);
      return;
    }

    const statusCode = error.statusCode ?? 500;
    const body: EndraErrorResponse = {
      success: false,
      error: {
        code: statusCode === 500 ? "INTERNAL_ERROR" : "REQUEST_ERROR",
        message: statusCode === 500 ? "Internal server error" : error.message,
      },
    };
    reply.status(statusCode).send(body);
  });

  app.setNotFoundHandler((request, reply) => {
    const body: EndraErrorResponse = {
      success: false,
      error: {
        code: "NOT_FOUND",
        message: `Route ${request.method} ${request.url} not found`,
      },
    };
    reply.status(404).send(body);
  });

  app.register(registerHealthRoute);
  app.register(registerMessageRoute, { prefix: "/api/v1" });

  return app;
}
