// Channel-agnostic message envelope shared by ENDRA Core and every channel
// (Telegram, web, voice, desktop) that calls into it.

export const ENDRA_CHANNELS = ["telegram", "web", "voice", "desktop", "api"] as const;
export type EndraChannel = (typeof ENDRA_CHANNELS)[number];

export type EndraAttachment =
  | { type: "audio"; data: string; mimeType: string }
  | { type: "image"; data: string; mimeType: string };

export interface EndraMessageRequest {
  channel: EndraChannel;
  userId: string;
  conversationId: string;
  /** May be empty if the request is just a voice note or a photo with no caption. */
  message: string;
  /** base64-encoded voice notes/photos - Core transcribes/looks at these itself. */
  attachments?: EndraAttachment[];
}

export interface EndraMessageResponseData {
  message: string;
  conversationId: string;
  /** Set when a tool (e.g. image generation) produced media to send back. */
  attachments?: EndraAttachment[];
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
