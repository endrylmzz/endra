// Minimal Telegram Bot API client - just what this adapter needs
// (long polling + sending text/photos + downloading voice/photo
// files). No library dependency; the API is simple enough that raw
// fetch is clearer than pulling in a framework for a temporary bridge
// (see ADR-005).

const TELEGRAM_API_BASE = "https://api.telegram.org";
const TELEGRAM_FILE_BASE = "https://api.telegram.org/file";
export const MAX_MESSAGE_LENGTH = 4096;

export interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    from?: { id: number; username?: string };
    chat: { id: number };
    text?: string;
    caption?: string;
    voice?: { file_id: string; mime_type?: string; duration: number };
    photo?: { file_id: string; width: number; height: number }[];
  };
}

export function chunkMessage(text: string, maxLength: number = MAX_MESSAGE_LENGTH): string[] {
  if (text.length <= maxLength) return [text];
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += maxLength) {
    chunks.push(text.slice(i, i + maxLength));
  }
  return chunks;
}

export class TelegramClient {
  constructor(private readonly token: string) {}

  private url(method: string): string {
    return `${TELEGRAM_API_BASE}/bot${this.token}/${method}`;
  }

  private async call(method: string, body: Record<string, unknown>): Promise<unknown> {
    const response = await fetch(this.url(method), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = (await response.json()) as { ok: boolean; result?: unknown; description?: string };
    if (!data.ok) {
      throw new Error(`Telegram ${method} failed: ${data.description ?? response.statusText}`);
    }
    return data.result;
  }

  async getUpdates(offset: number, timeoutSeconds = 30): Promise<TelegramUpdate[]> {
    const result = await this.call("getUpdates", { offset, timeout: timeoutSeconds });
    return result as TelegramUpdate[];
  }

  async sendMessage(chatId: number, text: string): Promise<void> {
    for (const chunk of chunkMessage(text)) {
      try {
        await this.call("sendMessage", { chat_id: chatId, text: chunk, parse_mode: "Markdown" });
      } catch (err) {
        // The LLM's Markdown isn't guaranteed to be valid for Telegram's
        // strict parser (unbalanced *, _, etc.) - fall back to plain text
        // rather than dropping the reply entirely.
        console.warn("sendMessage with Markdown parsing failed, retrying as plain text:", err);
        await this.call("sendMessage", { chat_id: chatId, text: chunk });
      }
    }
  }

  async sendPhoto(
    chatId: number,
    base64Data: string,
    mimeType: string,
    caption?: string,
  ): Promise<void> {
    const buffer = Buffer.from(base64Data, "base64");
    const extension = mimeType.split("/")[1] ?? "png";
    const form = new FormData();
    form.append("chat_id", String(chatId));
    if (caption) form.append("caption", caption);
    form.append("photo", new Blob([buffer], { type: mimeType }), `image.${extension}`);

    const response = await fetch(this.url("sendPhoto"), { method: "POST", body: form });
    const data = (await response.json()) as { ok: boolean; description?: string };
    if (!data.ok) {
      throw new Error(`Telegram sendPhoto failed: ${data.description ?? response.statusText}`);
    }
  }

  async sendTyping(chatId: number): Promise<void> {
    await this.call("sendChatAction", { chat_id: chatId, action: "typing" });
  }

  /** Downloads a Telegram file (voice note, photo, ...) and returns it base64-encoded. */
  async downloadFile(fileId: string): Promise<string> {
    const file = (await this.call("getFile", { file_id: fileId })) as { file_path?: string };
    if (!file.file_path) throw new Error(`Telegram getFile returned no file_path for ${fileId}`);

    const response = await fetch(`${TELEGRAM_FILE_BASE}/bot${this.token}/${file.file_path}`);
    if (!response.ok) throw new Error(`Downloading Telegram file failed: ${response.status}`);
    const buffer = Buffer.from(await response.arrayBuffer());
    return buffer.toString("base64");
  }
}
