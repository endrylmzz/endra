// ENDRA Telegram adapter - see ADR-005. Long-polls Telegram, calls
// ENDRA Core over HTTP, sends the reply back. Temporary stand-in for
// an eventual n8n workflow.

import { TelegramClient } from "./telegram-api.js";
import { handleUpdate } from "./handle-update.js";
import { isAuthorized } from "./authorization.js";
import { callCore } from "./core-client.js";
import { startPushServer } from "./push-server.js";

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) throw new Error("TELEGRAM_BOT_TOKEN is not set");

const coreBaseUrl = process.env.CORE_BASE_URL ?? "http://localhost:3000";
const allowedUsersEnv = process.env.ENDRA_ALLOWED_TELEGRAM_USERS;
const pushPort = Number(process.env.TELEGRAM_PUSH_PORT ?? 3101);
const pushSecret = process.env.ENDRA_INTERNAL_SECRET;
if (!pushSecret) throw new Error("ENDRA_INTERNAL_SECRET is not set");

const client = new TelegramClient(token);
let offset = 0;

startPushServer(pushPort, {
  secret: pushSecret,
  sendMessage: (chatId, text) => client.sendMessage(chatId, text),
});

console.log(`ENDRA Telegram adapter started (long polling, Core at ${coreBaseUrl}).`);

for (;;) {
  try {
    const updates = await client.getUpdates(offset);
    for (const update of updates) {
      offset = update.update_id + 1;
      await handleUpdate(update, {
        isAuthorized: (userId) => isAuthorized(userId, allowedUsersEnv),
        downloadFile: (fileId) => client.downloadFile(fileId),
        callCore: (params) => callCore(params, coreBaseUrl),
        sendMessage: (chatId, text) => client.sendMessage(chatId, text),
        sendPhoto: (chatId, data, mimeType, caption) =>
          client.sendPhoto(chatId, data, mimeType, caption),
        sendVoice: (chatId, data, mimeType, caption) =>
          client.sendVoice(chatId, data, mimeType, caption),
        sendTyping: (chatId) => client.sendTyping(chatId),
      });
    }
  } catch (err) {
    console.error("Polling error:", err);
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }
}
