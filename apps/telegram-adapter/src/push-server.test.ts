import { describe, expect, it, vi } from "vitest";
import { processPushRequest } from "./push-server.js";

function fakeDeps(
  overrides: Partial<{ secret: string; sendMessage: ReturnType<typeof vi.fn> }> = {},
) {
  return {
    secret: "s3cret",
    sendMessage: vi.fn(async () => {}),
    ...overrides,
  };
}

describe("processPushRequest", () => {
  it("rejects anything but POST /push", async () => {
    const deps = fakeDeps();
    const result = await processPushRequest(
      { method: "GET", url: "/push", secretHeader: "s3cret", body: "" },
      deps,
    );
    expect(result.status).toBe(404);
    expect(deps.sendMessage).not.toHaveBeenCalled();
  });

  it("rejects a missing or wrong secret", async () => {
    const deps = fakeDeps();
    const result = await processPushRequest(
      { method: "POST", url: "/push", secretHeader: "wrong", body: "{}" },
      deps,
    );
    expect(result.status).toBe(401);
    expect(deps.sendMessage).not.toHaveBeenCalled();
  });

  it("rejects an invalid JSON body", async () => {
    const deps = fakeDeps();
    const result = await processPushRequest(
      { method: "POST", url: "/push", secretHeader: "s3cret", body: "not json" },
      deps,
    );
    expect(result.status).toBe(400);
  });

  it("rejects a body missing conversationId or message", async () => {
    const deps = fakeDeps();
    const result = await processPushRequest(
      {
        method: "POST",
        url: "/push",
        secretHeader: "s3cret",
        body: JSON.stringify({ message: "hi" }),
      },
      deps,
    );
    expect(result.status).toBe(400);
    expect(deps.sendMessage).not.toHaveBeenCalled();
  });

  it("sends the message to the given chat id on a valid request", async () => {
    const deps = fakeDeps();
    const result = await processPushRequest(
      {
        method: "POST",
        url: "/push",
        secretHeader: "s3cret",
        body: JSON.stringify({ conversationId: "42", message: "hatırlatma zamanı" }),
      },
      deps,
    );
    expect(result.status).toBe(200);
    expect(deps.sendMessage).toHaveBeenCalledWith(42, "hatırlatma zamanı");
  });

  it("returns 502 when sending the message fails", async () => {
    const deps = fakeDeps({ sendMessage: vi.fn().mockRejectedValue(new Error("telegram down")) });
    const result = await processPushRequest(
      {
        method: "POST",
        url: "/push",
        secretHeader: "s3cret",
        body: JSON.stringify({ conversationId: "42", message: "hi" }),
      },
      deps,
    );
    expect(result.status).toBe(502);
  });
});
