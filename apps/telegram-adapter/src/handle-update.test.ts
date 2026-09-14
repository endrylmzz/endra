import { describe, expect, it, vi } from "vitest";
import { handleUpdate, type HandleUpdateDeps } from "./handle-update.js";
import type { TelegramUpdate } from "./telegram-api.js";

function fakeDeps(overrides: Partial<HandleUpdateDeps> = {}): HandleUpdateDeps {
  return {
    isAuthorized: vi.fn(() => true),
    downloadFile: vi.fn(async () => "ZmFrZS1kYXRh"),
    callCore: vi.fn(async () => ({ message: "Merhaba Ender." })),
    sendMessage: vi.fn(async () => {}),
    sendPhoto: vi.fn(async () => {}),
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
  it("ignores updates with no text, voice, or photo", async () => {
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

  it("downloads and forwards a voice note as an audio attachment", async () => {
    const deps = fakeDeps();
    const update: TelegramUpdate = {
      update_id: 1,
      message: {
        message_id: 1,
        from: { id: 42 },
        chat: { id: 42 },
        voice: { file_id: "voice-1", mime_type: "audio/ogg", duration: 3 },
      },
    };

    await handleUpdate(update, deps);

    expect(deps.downloadFile).toHaveBeenCalledWith("voice-1");
    expect(deps.callCore).toHaveBeenCalledWith({
      userId: "42",
      conversationId: "42",
      message: "",
      attachments: [{ type: "audio", data: "ZmFrZS1kYXRh", mimeType: "audio/ogg" }],
    });
  });

  it("downloads the largest photo size and forwards it as an image attachment", async () => {
    const deps = fakeDeps();
    const update: TelegramUpdate = {
      update_id: 1,
      message: {
        message_id: 1,
        from: { id: 42 },
        chat: { id: 42 },
        caption: "bu ne?",
        photo: [
          { file_id: "small", width: 90, height: 90 },
          { file_id: "large", width: 800, height: 800 },
        ],
      },
    };

    await handleUpdate(update, deps);

    expect(deps.downloadFile).toHaveBeenCalledWith("large");
    expect(deps.callCore).toHaveBeenCalledWith({
      userId: "42",
      conversationId: "42",
      message: "bu ne?",
      attachments: [{ type: "image", data: "ZmFrZS1kYXRh", mimeType: "image/jpeg" }],
    });
  });

  it("sends a photo instead of a text message when Core's reply includes an image", async () => {
    const deps = fakeDeps({
      callCore: vi.fn(async () => ({
        message: "İşte görsel!",
        attachments: [{ type: "image" as const, data: "QUFB", mimeType: "image/png" }],
      })),
    });

    await handleUpdate(textUpdate("bir kedi çiz"), deps);

    expect(deps.sendPhoto).toHaveBeenCalledWith(42, "QUFB", "image/png", "İşte görsel!");
    expect(deps.sendMessage).not.toHaveBeenCalled();
  });
});
