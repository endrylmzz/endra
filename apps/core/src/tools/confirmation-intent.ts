// Keyword-based yes/no detection for responding to a pending tool
// approval in natural chat. Deliberately simple (no extra LLM call just
// to classify a yes/no) - "unclear" is the safe default when a message
// doesn't clearly match either list, so an ambiguous reply never
// silently approves a write/critical action.

const AFFIRMATIVE_WORDS = [
  "evet",
  "tamam",
  "onayla",
  "onaylıyorum",
  "yap",
  "olur",
  "kesinlikle",
  "yes",
  "ok",
  "okay",
  "confirm",
  "approve",
  "sure",
];

const NEGATIVE_WORDS = [
  "hayır",
  "hayir",
  "iptal",
  "vazgeç",
  "vazgec",
  "yapma",
  "istemiyorum",
  "no",
  "cancel",
  "reject",
  "nope",
];

export type ConfirmationIntent = "approve" | "reject" | "unclear";

export function detectConfirmationIntent(message: string): ConfirmationIntent {
  const words = message
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter(Boolean);

  const isAffirmative = words.some((word) => AFFIRMATIVE_WORDS.includes(word));
  const isNegative = words.some((word) => NEGATIVE_WORDS.includes(word));

  if (isAffirmative && !isNegative) return "approve";
  if (isNegative && !isAffirmative) return "reject";
  return "unclear";
}
