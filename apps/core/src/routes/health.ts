import type { FastifyInstance } from "fastify";
import { ENDRA_VERSION } from "@endra/shared";

export async function registerHealthRoute(app: FastifyInstance): Promise<void> {
  app.get("/health", async () => ({
    status: "ok",
    version: ENDRA_VERSION,
    uptime: process.uptime(),
  }));
}
