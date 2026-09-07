import { describe, expect, it } from "vitest";
import { buildApp } from "./app.js";

const app = buildApp({ logger: false });

describe("GET /health", () => {
  it("returns ok status", async () => {
    const response = await app.inject({ method: "GET", url: "/health" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ status: "ok" });
  });
});

describe("POST /api/v1/message", () => {
  it("returns a success envelope for a valid request", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/message",
      payload: {
        channel: "api",
        userId: "ender",
        conversationId: "test-conversation",
        message: "Merhaba Endra",
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      success: true,
      data: {
        message: "ENDRA Core is running.",
        conversationId: "test-conversation",
      },
    });
  });

  it("rejects a request missing required fields with a 400 error envelope", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/message",
      payload: {
        channel: "api",
        userId: "ender",
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      success: false,
      error: { code: "VALIDATION_ERROR" },
    });
  });

  it("rejects a request with an unexpected extra field", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/message",
      payload: {
        channel: "api",
        userId: "ender",
        conversationId: "test-conversation",
        message: "hi",
        extra: "not allowed",
      },
    });

    expect(response.statusCode).toBe(400);
  });

  it("rejects an unknown channel value", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/message",
      payload: {
        channel: "fax",
        userId: "ender",
        conversationId: "test-conversation",
        message: "hi",
      },
    });

    expect(response.statusCode).toBe(400);
  });
});

describe("unknown routes", () => {
  it("returns a 404 error envelope", async () => {
    const response = await app.inject({ method: "GET", url: "/does-not-exist" });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({
      success: false,
      error: { code: "NOT_FOUND" },
    });
  });
});
