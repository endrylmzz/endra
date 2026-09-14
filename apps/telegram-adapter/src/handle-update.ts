import type { TelegramUpdate } from "./telegram-api.js";

export interface HandleUpdateDeps {
  isAuthorized: (userId: number) => boolean;
  callCore: (params: {
    userId: string;
    conversationId: string;
    message: string;
  }) => Promise<string>;
  sendMessage: (chatId: number, text: string) => Promise<void>;
  sendTyping: (chatId: number) => Promise<void>;
}

export async function handleUpdate(update: TelegramUpdate, deps: HandleUpdateDeps): Promise<void> {
  const message = update.message;
  if (!message?.text || !message.from) return; // ignore non-text updates (photos, stickers, ...) for now

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
    const reply = await deps.callCore({
      userId: String(userId),
      conversationId: String(chatId),
      message: message.text,
    });
    await deps.sendMessage(chatId, reply);
  } catch (err) {
    console.error("Failed to handle Telegram message:", err);
    await deps.sendMessage(chatId, "Bir hata oldu, tekrar dener misin?");
  }
}
