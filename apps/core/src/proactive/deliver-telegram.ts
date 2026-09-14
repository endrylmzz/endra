// ADR-007: Core stays channel-agnostic - it doesn't speak Telegram's
// Bot API itself, it calls a small local push endpoint that
// apps/telegram-adapter exposes for exactly this.

const DEFAULT_PUSH_URL = "http://127.0.0.1:3101/push";

export async function deliverToTelegram(
  externalConversationId: string,
  message: string,
  pushUrl: string = process.env.TELEGRAM_PUSH_URL ?? DEFAULT_PUSH_URL,
  secret: string | undefined = process.env.ENDRA_INTERNAL_SECRET,
): Promise<void> {
  const response = await fetch(pushUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Endra-Internal-Secret": secret ?? "" },
    body: JSON.stringify({ conversationId: externalConversationId, message }),
  });
  if (!response.ok) {
    throw new Error(`Telegram push failed: ${response.status}`);
  }
}
