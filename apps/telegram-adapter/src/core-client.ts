// Calls ENDRA Core's channel-agnostic endpoint - the same contract any
// future channel (n8n's Telegram workflow included) would use.

import type { EndraAttachment } from "@endra/agent-contracts";

export interface CoreMessageParams {
  userId: string;
  conversationId: string;
  message: string;
  attachments?: EndraAttachment[];
}

export interface CoreMessageResult {
  message: string;
  attachments?: EndraAttachment[];
}

export async function callCore(
  params: CoreMessageParams,
  coreBaseUrl: string,
): Promise<CoreMessageResult> {
  const response = await fetch(`${coreBaseUrl}/api/v1/message`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ channel: "telegram", ...params }),
  });

  const data = (await response.json()) as {
    success: boolean;
    data?: CoreMessageResult;
    error?: { message: string };
  };

  if (!data.success || !data.data) {
    throw new Error(data.error?.message ?? "ENDRA Core returned an error");
  }

  return data.data;
}
