// VOICE-003: text-to-speech, the mirror of transcription.ts. Separate
// file for the same reason - a different OpenAI API (audio, not chat).

import OpenAI from "openai";

const SPEECH_MODEL = "gpt-4o-mini-tts";
const DEFAULT_VOICE = "alloy";

let defaultClient: OpenAI | undefined;
function getDefaultClient(): OpenAI {
  defaultClient ??= new OpenAI();
  return defaultClient;
}

export async function synthesizeSpeech(
  text: string,
  client: OpenAI = getDefaultClient(),
): Promise<string> {
  const response = await client.audio.speech.create({
    model: process.env.OPENAI_TTS_MODEL ?? SPEECH_MODEL,
    voice: process.env.OPENAI_TTS_VOICE ?? DEFAULT_VOICE,
    input: text,
    response_format: "opus",
  });
  const buffer = Buffer.from(await response.arrayBuffer());
  return buffer.toString("base64");
}
