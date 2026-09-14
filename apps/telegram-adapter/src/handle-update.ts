import type { EndraAttachment } from "@endra/agent-contracts";
import type { TelegramUpdate } from "./telegram-api.js";

export interface HandleUpdateDeps {
  isAuthorized: (userId: number) => boolean;
  downloadFile: (fileId: string) => Promise<string>;
  callCore: (params: {
    userId: string;
    conversationId: string;
    message: string;
    attachments?: EndraAttachment[];
  }) => Promise<{ message: string; attachments?: EndraAttachment[] }>;
  sendMessage: (chatId: number, text: string) => Promise<void>;
  sendPhoto: (
    chatId: number,
    base64Data: string,
    mimeType: string,
    caption?: string,
  ) => Promise<void>;
  sendTyping: (chatId: number) => Promise<void>;
}

export async function handleUpdate(update: TelegramUpdate, deps: HandleUpdateDeps): Promise<void> {
  const message = update.message;
  const hasVoice = Boolean(message?.voice);
  const hasPhoto = Boolean(message?.photo && message.photo.length > 0);
  if (!message?.from || (!message.text && !hasVoice && !hasPhoto)) return; // ignore stickers, etc.

  const userId = message.from.id;
  const chatId = message.chat.id;

  if (!deps.isAuthorized(userId)) {
    console.warn(
      `Unauthorized Telegram user ${userId} (${message.from.username ?? "no username"}) tried to message the bot.`,
    );
    return; // stay silent - don't confirm to a stranger that the bot exists
  }

  await deps.sendTyping(chatId);

  try {
    const attachments: EndraAttachment[] = [];
    if (message.voice) {
      const data = await deps.downloadFile(message.voice.file_id);
      attachments.push({ type: "audio", data, mimeType: message.voice.mime_type ?? "audio/ogg" });
    }
    if (message.photo && message.photo.length > 0) {
      // Telegram sends multiple resolutions - the last one is the largest.
      const largest = message.photo[message.photo.length - 1];
      const data = await deps.downloadFile(largest.file_id);
      attachments.push({ type: "image", data, mimeType: "image/jpeg" });
    }

    const reply = await deps.callCore({
      userId: String(userId),
      conversationId: String(chatId),
      message: message.text ?? message.caption ?? "",
      ...(attachments.length > 0 ? { attachments } : {}),
    });

    const imageAttachment = reply.attachments?.find((a) => a.type === "image");
    if (imageAttachment) {
      await deps.sendPhoto(chatId, imageAttachment.data, imageAttachment.mimeType, reply.message);
    } else {
      await deps.sendMessage(chatId, reply.message);
    }
  } catch (err) {
    console.error("Failed to handle Telegram message:", err);
    await deps.sendMessage(chatId, "Bir hata oldu, tekrar dener misin?");
  }
}
