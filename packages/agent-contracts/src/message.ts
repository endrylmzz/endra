// Channel-agnostic message envelope shared by ENDRA Core and every channel
// (Telegram, web, voice, desktop) that calls into it.

export const ENDRA_CHANNELS = ["telegram", "web", "voice", "desktop", "api"] as const;
export type EndraChannel = (typeof ENDRA_CHANNELS)[number];

export interface EndraMessageRequest {
  channel: EndraChannel;
  userId: string;
  conversationId: string;
  message: string;
}

export interface EndraMessageResponseData {
  message: string;
  conversationId: string;
}

export interface EndraSuccessResponse<T> {
  success: true;
  data: T;
}

export interface EndraErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
  };
}

export type EndraApiResponse<T> = EndraSuccessResponse<T> | EndraErrorResponse;
