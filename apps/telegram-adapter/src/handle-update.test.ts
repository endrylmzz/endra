import { describe, expect, it, vi } from "vitest";
import { handleUpdate, type HandleUpdateDeps } from "./handle-update.js";
import type { TelegramUpdate } from "./telegram-api.js";

function fakeDeps(overrides: Partial<HandleUpdateDeps> = {}): HandleUpdateDeps {
  return {
    isAuthorized: vi.fn(() => true),
    callCore: vi.fn(async () => "Merhaba Ender."),
    sendMessage: vi.fn(async () => {}),
    sendTyping: vi.fn(async () => {}),
    ...overrides,
  };
}

function textUpdate(text: string): TelegramUpdate {
  return {
    update_id: 1,
    message: {
      message_id: 1,
      from: { id: 42, username: "ender" },
      chat: { id: 42 },
      text,
    },
  };
}

describe("handleUpdate", () => {
  it("ignores updates without a text message", async () => {
    const deps = fakeDeps();

    await handleUpdate({ update_id: 1 }, deps);

    expect(deps.callCore).not.toHaveBeenCalled();
  });

  it("silently ignores unauthorized users", async () => {
    const deps = fakeDeps({ isAuthorized: vi.fn(() => false) });

    await handleUpdate(textUpdate("merhaba"), deps);

    expect(deps.callCore).not.toHaveBeenCalled();
    expect(deps.sendMessage).not.toHaveBeenCalled();
  });

  it("sends typing, calls Core, and relays the reply for an authorized user", async () => {
    const deps = fakeDeps();

    await handleUpdate(textUpdate("merhaba"), deps);

    expect(deps.sendTyping).toHaveBeenCalledWith(42);
    expect(deps.callCore).toHaveBeenCalledWith({
      userId: "42",
      conversationId: "42",
      message: "merhaba",
    });
    expect(deps.sendMessage).toHaveBeenCalledWith(42, "Merhaba Ender.");
  });

  it("sends a friendly error message when Core call fails", async () => {
    const deps = fakeDeps({ callCore: vi.fn().mockRejectedValue(new Error("core down")) });

    await handleUpdate(textUpdate("merhaba"), deps);

    expect(deps.sendMessage).toHaveBeenCalledWith(42, expect.stringContaining("hata"));
  });
});
