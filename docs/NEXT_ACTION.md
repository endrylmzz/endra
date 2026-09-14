# NEXT ACTION

Continue task:
None in progress. `TOOLARCH-009` (multimodal input + image generation +
key-free tools) is done, tested locally against real OpenAI/CoinGecko -
**not yet deployed**. Trigger a RepoCloud rebuild when ready, then
verify once via real Telegram (voice note, photo, "resim çiz") before
considering this fully done in production.

Goal:
Get voice/vision/image-generation actually running on the VPS, verify
once via real Telegram messages, then decide which key-requiring tool
to build next (weather, web search, calendar, Gmail).

## Current state - TOOLARCH-009 (multimodal input + image gen + key-free tools)

- `packages/agent-contracts/src/message.ts` - `EndraAttachment` union
  (`audio` | `image`, both `{ data: base64, mimeType }`).
  `EndraMessageRequest.attachments` and
  `EndraMessageResponseData.attachments` added.
- `packages/agent-contracts/src/llm.ts` - `LLMMessage.imageUrls?: string[]`
  for vision input.
- `apps/core/src/media/transcription.ts` - `transcribeAudio()`, OpenAI
  `gpt-4o-transcribe`.
- `apps/core/src/llm/openai-provider.ts` - maps `imageUrls` to OpenAI's
  `image_url` content parts.
- `apps/core/src/tools/builtin/generate-image.ts` - `generate_image`
  tool, OpenAI `gpt-image-1`, returns `{ type: "image", data: base64,
  mimeType }` on success.
- `apps/core/src/tools/builtin/crypto-price.ts` - `get_crypto_price`,
  free CoinGecko API, no key.
- `apps/core/src/tools/builtin/notes.ts` - `save_note` (renamed from
  `notes`) plus new `list_notes` and `delete_note` (delete requires
  confirmation, scoped by `id` AND `user_id`).
- `apps/core/src/services/message-service.ts` - incoming audio
  attachments are transcribed and appended to the message text before
  the LLM sees it; incoming image attachments become `imageUrls` on the
  LLM message. On the way out, a tool result that is an image (from
  `generate_image`) is diverted: it's attached to the response
  directly and the LLM only sees a short success note in the tool
  result, never the raw base64 - keeps the model from trying to
  "describe" or repeat the image data as text.
- `apps/core/src/routes/message.ts` - request schema now accepts either
  a non-empty `message` or a non-empty `attachments` array (`anyOf`).
- `apps/telegram-adapter/src/telegram-api.ts` - `downloadFile()` (calls
  `getFile` then fetches the bytes, returns base64) and `sendPhoto()`
  (multipart upload).
- `apps/telegram-adapter/src/handle-update.ts` - detects `voice`/`photo`
  on incoming updates, downloads and forwards as attachments; if the
  Core reply carries an image attachment, sends it via `sendPhoto`
  instead of `sendMessage`.
- Verified live, end to end, against real APIs (not mocks): CoinGecko
  price lookup succeeded; `gpt-4o-transcribe` transcribed a real audio
  file; `gpt-5.6` returned a sensible reply given real image input;
  `gpt-image-1` generated a real image. All four passed.
- 135 tests total, all passing (19 new since the last checkpoint).
  Clean build, clean lint, clean Prettier format across all 5
  workspaces.

## Not deployed yet

This whole change is sitting on `main`, tested locally, not yet on the
VPS. To go live: RepoCloud dashboard -> `endra-core` project -> "Resume
Chat" -> ask the agent to pull latest from `main`, rebuild, and restart
both services. Then from Telegram: send a voice note, send a photo, and
ask it to draw something - confirm all three work in production, not
just locally.

## Other open items (not blocking)

- `MEMORY-008` (project memory) - likely just documenting that
  `type: "project"` in `memories` already covers this.
- Real external tools that need a key/OAuth (weather, web search,
  calendar, Gmail - Phase 5) - ask when building that specific one, and
  remember to pass explicit risk-level `overrides` for any MCP-sourced
  tool that mutates state (see `mcp-client.ts`'s warning - MCP has no
  risk metadata of its own).
- Text-to-speech / voice replies (`VOICE-003`/`VOICE-004`) are still
  open - ENDRA can hear and see now, but always replies in text.
- Multiple tool calls in one turn where one requires confirmation:
  currently the other calls' results are computed but not surfaced to
  the user in that turn (a deliberate v1 simplification).

Important:
Keep the pattern: build standalone -> unit test with fakes -> verify
with a real end-to-end call -> only then treat as done. This session's
live checks are what actually exercise the OpenAI API contracts (audio
format handling, vision content shape, image response shape) that unit
tests with fakes can't catch.
