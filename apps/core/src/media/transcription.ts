// Voice message transcription (Phase 7 groundwork - Telegram voice
// notes today). Separate from llm/openai-provider.ts because this is
// a different OpenAI API (audio, not chat), same reasoning as
// memory/embeddings.ts.

import OpenAI, { toFile } from "openai";

const TRANSCRIPTION_MODEL = "gpt-4o-transcribe";

let defaultClient: OpenAI | undefined;
function getDefaultClient(): OpenAI {
  defaultClient ??= new OpenAI();
  return defaultClient;
}

function extensionForMimeType(mimeType: string): string {
  const subtype = mimeType.split("/")[1]?.split(";")[0];
  return subtype || "ogg";
}

export async function transcribeAudio(
  base64Data: string,
  mimeType: string,
  client: OpenAI = getDefaultClient(),
): Promise<string> {
  const buffer = Buffer.from(base64Data, "base64");
  const file = await toFile(buffer, `voice.${extensionForMimeType(mimeType)}`, { type: mimeType });
  const response = await client.audio.transcriptions.create({
    file,
    model: TRANSCRIPTION_MODEL,
  });
  return response.text;
}
