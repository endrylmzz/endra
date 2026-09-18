# NEXT ACTION

Continue task:
None in progress. **All of Phase 5 is now done** - `TOOLS-003`
(Calendar) and `TOOLS-004` (Gmail) closed with real Google OAuth (see
below and `ADR-008`). `TOOLARCH-009` (multimodal) and reminders
(`TOOLS-006`, `PROACTIVE-001`, `PROACTIVE-004`) are deployed and
confirmed working in production. Six feature batches are built, tested,
and verified live, but **not yet deployed** (Ender wants a few more
updates first) - see the "Current state" sections below, newest first:
Calendar + Gmail (Google OAuth), web_search + run_code (OpenAI-hosted),
weather monitors + retry + multi-tool fix + list_capabilities, weather +
Wikipedia search, recurring reminders + price alerts, text-to-speech.
`MEMORY-008`, `TOOLS-005`, `TOOLS-007`, `TOOLS-002` closed earlier (see
DEVLOG). `TELEGRAM-002` (n8n Telegram trigger) explored and explicitly
**skipped** for now - see below.

Goal:
Every tool-shaped roadmap item is done. Only Phase 8 (Web/PWA) and
Phase 9 (Desktop) remain, both explicitly out of scope per CLAUDE.md
section 14 - don't start those without Ender explicitly asking. Next
session should deploy what's sitting on `main` (one RepoCloud rebuild
covers all six pending batches - **this time there ARE new secrets
needed**: `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`/`GOOGLE_REFRESH_TOKEN`,
copy the real values from local `.env`) or ask Ender directly what he
wants next.

## Current state - Calendar + Gmail via Google OAuth (TOOLS-003/004, ADR-008)

Ender asked to set up Google OAuth for Calendar/Gmail. Walked him
through Google Cloud Console step by step (project, OAuth consent
screen with `gmail.readonly`/`gmail.send`/`calendar` scopes, Desktop-app
OAuth client) since that part requires his own Google login - I can't
do it on his behalf.

- `scripts/google-oauth-setup.mjs` (new) - one-time interactive script:
  prints the consent URL, Ender approves in his own browser, the
  script catches the loopback redirect (`127.0.0.1:45678/callback`),
  exchanges the code for a refresh token, writes it into `.env`. Ran
  once already - `GOOGLE_REFRESH_TOKEN` is live in local `.env`.
- `apps/core/src/google/oauth-client.ts` (new) - `getGoogleAccessToken()`
  mints access tokens from the refresh token, cached until shortly
  before expiry.
- `apps/core/src/tools/builtin/calendar.ts` (new) -
  `list_calendar_events` (read), `create_calendar_event` (write,
  requires confirmation - a real calendar entry, unlike a private
  reminder), `delete_calendar_event` (write, requires confirmation).
- `apps/core/src/tools/builtin/gmail.ts` (new) - `list_emails` /
  `read_email` (both read), `send_email` (`riskLevel: "critical"`,
  always requires confirmation - CLAUDE.md section 6's named example).
  MIME parsing (recursively finds the `text/plain` part) and building
  (RFC 2047-encodes non-ASCII header values) both hand-rolled - no new
  dependency, matches every other integration here.
- All four raw-REST, no `googleapis` dependency (see `ADR-008`).
- Verified live against the real Google account (not mocks): listed
  the real calendar, created+verified+deleted a real test event; listed
  real inbox messages and read one's real body; sent a real test email
  to Ender's own address and read it back. **Found and fixed a real
  bug this way**: the first live send had a mangled Subject line (raw
  UTF-8 in an email header needs RFC 2047 encoding - the body doesn't,
  it's covered by the `Content-Type` charset instead) - fixed, then
  re-verified live with a Turkish-character subject.
- 242 tests total, all passing (21 new). Clean build, clean lint, clean
  Prettier format.

### Not yet deployed

Sitting on `main`, not yet on the VPS. **Needs new secrets this time**:
`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN` -
copy the real values from local `.env` into both services' production
environment (not just Core - actually only Core calls Google's APIs,
so `endra-core`'s environment is the only one that needs them). To go
live: RepoCloud dashboard -> `endra-core` project -> "Resume Chat" ->
set the new env vars, pull latest, rebuild, restart. Then verify via a
real Telegram message: ask about upcoming calendar events, ask it to
read a recent email.

## Current state - web_search + run_code (closes TOOLS-002 for real)

Ender asked whether OpenAI itself could cover web search instead of
needing a separate paid search key. Verified live: yes.

- `apps/core/src/tools/builtin/web-search.ts` (new) - `web_search`,
  wraps OpenAI's Responses API hosted `web_search` tool
  (`client.responses.create({ tools: [{ type: "web_search" }], input:
query })`) - bills through the already-configured `OPENAI_API_KEY`,
  no separate search provider/key needed. Real, current, cited results
  - this is what `search_wikipedia` (static facts only) couldn't do.
    **Corrects the earlier assumption** (see the memory note
    `key_requiring_tools_deferred.md`, now updated) that `TOOLS-002`
    needed a paid search API key.
- `apps/core/src/tools/builtin/run-code.ts` (new) - `run_code`, wraps
  the hosted `code_interpreter` tool (`tools: [{ type:
"code_interpreter", container: { type: "auto" } }]`) - real sandboxed
  Python execution for anything beyond the `calculator` tool's basic
  arithmetic (real math, data analysis, verifying a result). Also
  no new key.
- Both follow the same pattern as `generate-image.ts`
  (`createXTool(client: OpenAI = getDefaultClient())`, injectable for
  tests) - the main chat pipeline stays on the Chat Completions API
  (`openai-provider.ts`); these tools each make their own separate
  Responses API call internally, so no change to the core provider
  architecture was needed.
- Verified live end-to-end through the actual message pipeline (not
  isolated mocks): a real "bugün gündemde ne var" question got a real,
  cited news answer; a real "1-50 arası asal sayıların toplamı" request
  got the correct answer (328) from real executed Python.
- 221 tests total, all passing (6 new). Clean build, clean lint, clean
  Prettier format.

## Current state - weather monitors, delivery retry, multi-tool fix, list_capabilities

- `apps/core/src/weather/open-meteo.ts` (new) - the `get_weather` tool's
  fetch logic (geocoding + forecast) extracted out so it's shared
  rather than duplicated. Also exports `isPrecipitating()`.
- `apps/core/src/tools/builtin/weather-alerts.ts` +
  `apps/core/src/proactive/weather-alerts.ts` (new) -
  `set_weather_alert`/`list_weather_alerts`/`cancel_weather_alert`,
  mirroring `price-alerts.ts` exactly. Two kinds: `temperature`
  (direction + target °C) and `precipitation` (rain/snow/storm
  starting). Completes `PROACTIVE-003`. New migration
  `20260919090000_weather_alerts.sql`, already pushed live.
- `apps/core/src/proactive/scheduler.ts` - added `retry_count` handling
  (new migration `20260919093000_reminder_retry_count.sql`, already
  pushed live): a failed reminder delivery gets up to 3 more attempts
  across scheduler ticks before being marked `failed`, instead of
  giving up on the first transient failure. Also now runs
  `checkWeatherAlerts()` each tick.
- `apps/core/src/services/message-service.ts` - the pending-confirmation
  instruction now explicitly tells the model to also mention any other
  tool result already computed in the same turn, fixing a known gap
  (see old NEXT_ACTION text, now resolved) where that result was
  present in context but not reliably surfaced.
- `apps/core/src/tools/builtin/list-capabilities.ts` (new) -
  `list_capabilities` reads the tool registry itself so "neler
  yapabiliyorsun" stays accurate as tools are added.
- Verified live against real APIs/DB for all four pieces (not mocks) -
  see `docs/DEVLOG.md` (2026-09-19) for exact test transcripts. 215
  tests total, all passing (30 new). Clean build, clean lint, clean
  Prettier format.

### Not yet deployed

Sitting on `main`, not yet on the VPS. No new env vars or secrets
needed. To go live: RepoCloud dashboard -> `endra-core` project ->
"Resume Chat" -> pull latest, rebuild, restart both services.

## Current state - weather + Wikipedia search (TOOLS-001, partial TOOLS-002)

- `apps/core/src/tools/builtin/weather.ts` (new) - `get_weather`: geo
  codes a city name via Open-Meteo's free geocoding API, then fetches
  current temperature/humidity/wind/condition from Open-Meteo's free
  forecast API. **No API key at all** - Open-Meteo is free for
  non-commercial use, unlike most weather providers (OpenWeatherMap,
  WeatherAPI, etc. all require a key). WMO weather codes are mapped to
  short Turkish descriptions via a fixed lookup table.
- `apps/core/src/tools/builtin/wikipedia-search.ts` (new) -
  `search_wikipedia`: searches Turkish Wikipedia then fetches the top
  result's summary, both via Wikipedia's free REST API (no key). This
  is a **partial** stand-in for `TOOLS-002` - good for static,
  encyclopedic "kim/nedir/ne zaman" questions, not current events or
  general web search (no key-free general search API exists, so real
  `TOOLS-002` still needs Ender to get a paid search API key -
  Brave Search, Google Custom Search, or Bing, whenever that's picked
  up). Left `TOOLS-002` `pending` rather than marking it done, since it
  doesn't fully satisfy what a "web research tool" implies.
- `apps/core/src/tools/builtin/currency-conversion.ts` (new, not tied
  to a task id - a natural companion to `get_crypto_price`) -
  `convert_currency`: fiat-to-fiat conversion via Frankfurter's free
  ECB reference rates (no key).
- Verified live against all three real APIs (not mocks): a real
  Open-Meteo call for Istanbul, a real Wikipedia search+summary call
  for "Mustafa Kemal Atatürk", and a real Frankfurter USD->TRY
  conversion.
- 190 tests total, all passing (13 new). Clean build, clean lint,
  clean Prettier format.

## Current state - recurring reminders + price alerts (PROACTIVE-002/003/005)

- New migration `20260918090000_recurring_reminders_and_price_alerts.sql`
  (already pushed to the live Supabase project via `supabase db push`):
  adds nullable `recurrence_seconds` to `scheduled_jobs`, and a new
  `price_alerts` table (`coin_id`, `vs_currency`, `direction`
  above/below, `target_price`, `status` pending/triggered/cancelled).
- `apps/core/src/tools/builtin/reminders.ts` - `set_reminder` gained an
  optional `recurrenceSeconds` input.
- `apps/core/src/proactive/scheduler.ts` - `findDueReminders()` now
  also returns `dueAt`/`recurrenceSeconds`; `checkAndDeliverDueJobs()`
  reschedules a recurring job to `due_at + interval` (drift-free)
  instead of marking it `sent`. New `rescheduleReminder()`.
- `apps/core/src/proactive/price-alerts.ts` (new) - `fetchCryptoPrice()`
  (free CoinGecko, single pair), `findPendingPriceAlerts()`,
  `checkPriceAlerts()` (delivers and marks `triggered` once a target is
  crossed - a triggered/cancelled alert is never re-checked, which is
  the whole dedup/cooldown mechanism for `PROACTIVE-005`, no extra
  machinery needed), `markPriceAlertTriggered()`.
- `apps/core/src/tools/builtin/price-alerts.ts` (new) - `set_price_alert`
  (write, no confirmation), `list_price_alerts` (read),
  `cancel_price_alert` (write, requires confirmation - mirrors
  `cancel_reminder`'s reasoning).
- `apps/core/src/proactive/scheduler.ts`'s `startScheduler()` now runs
  `checkPriceAlerts()` on the same 30s tick as the reminder check.
- Verified live against the real Supabase DB and a real CoinGecko call
  (not mocks): a recurring reminder delivered once and rescheduled
  correctly; a price alert against BTC's real price triggered
  immediately and was marked `triggered`; re-checking confirmed no
  duplicate delivery. 177 tests total, all passing (22 new). Clean
  build, clean lint, clean Prettier format.

### Not yet deployed

Sitting on `main`, not yet on the VPS. No new env vars or secrets
needed. To go live: RepoCloud dashboard -> `endra-core` project ->
"Resume Chat" -> pull latest, rebuild, restart both services. Then
verify: ask for a recurring reminder and a price alert, confirm both
eventually fire via a real Telegram message.

## Current state - text-to-speech replies (VOICE-003, VOICE-004)

- `apps/core/src/media/speech.ts` (new) - `synthesizeSpeech()`, OpenAI
  `gpt-4o-mini-tts`, `response_format: "opus"` (Telegram voice notes
  need OGG/Opus - this skips any transcoding step entirely). Voice and
  model are overridable via `OPENAI_TTS_VOICE`/`OPENAI_TTS_MODEL`, both
  optional.
- `apps/core/src/services/message-service.ts` - tracks whether this
  turn's input included a voice attachment (`hadVoiceInput`); if so,
  every text reply this turn (including confirmation prompts) also
  gets synthesized and attached as an `audio` attachment. Mirrors the
  input's modality - no new user-facing setting. On any TTS failure,
  logs and falls back to text-only rather than breaking the reply.
- `apps/telegram-adapter/src/telegram-api.ts` - new `sendVoice()`
  (multipart upload, mirrors `sendPhoto()`).
- `apps/telegram-adapter/src/handle-update.ts` - sends a voice note
  when the reply carries an audio attachment; if both an image and
  audio attachment are present (e.g. a voice request to draw
  something), sends both - caption goes on the photo only, not
  duplicated onto the voice note.
- Verified live against the real OpenAI API (not mocks): a real
  `gpt-4o-mini-tts` call returned valid OGG/Opus bytes (magic number
  checked). 161 tests total, all passing (6 new). Clean build, clean
  lint, clean Prettier format.

### Not yet deployed

Sitting on `main`, not yet on the VPS. No new env vars or secrets
needed - reuses the existing `OPENAI_API_KEY`. To go live: RepoCloud
dashboard -> `endra-core` project -> "Resume Chat" -> pull latest,
rebuild, restart both services. Then verify with a real Telegram voice
message and confirm the reply comes back as a voice note.

## Current state - reminders (TOOLS-006, PROACTIVE-001, PROACTIVE-004)

- New table `scheduled_jobs` (migration
  `20260915120000_scheduled_jobs.sql`, already pushed to the live
  Supabase project via `supabase db push`) - one-shot reminders only,
  no recurrence yet (`PROACTIVE-002`/`PROACTIVE-003` are separate,
  still pending).
- `apps/core/src/tools/builtin/reminders.ts` - `set_reminder` (write,
  no confirmation - low-stakes, easily cancelled), `list_reminders`
  (read), `cancel_reminder` (write, requires confirmation - mirrors
  `delete_note`'s reasoning).
- `apps/core/src/proactive/scheduler.ts` - `findDueReminders()` (joins
  `scheduled_jobs` with `conversations` for channel + external id),
  `checkAndDeliverDueJobs()`, `startScheduler()` - an in-process
  `setInterval` (30s) started from `apps/core/src/index.ts` right after
  the HTTP server starts listening.
- **New architecture decision, `ADR-007`**: Core must stay
  channel-agnostic (ADR-004), so it doesn't call Telegram's Bot API
  directly for proactive delivery. Instead
  `apps/core/src/proactive/deliver-telegram.ts` calls a new local-only
  endpoint, `POST /push`, that `apps/telegram-adapter/src/push-server.ts`
  now exposes (`node:http`, bound to `127.0.0.1` only, guarded by
  `X-Endra-Internal-Secret`). No firewall change needed - both services
  already run on the same VPS (ADR-006) and reach each other over
  localhost, unlike what n8n integration would need (see below).
- `ENDRA_INTERNAL_SECRET` now has a real generated value in `.env` (it
  was an empty placeholder before) - **must be set to the same value
  in both Core's and the adapter's production environment**. New env
  vars `TELEGRAM_PUSH_URL` (Core side, default
  `http://127.0.0.1:3101/push`) and `TELEGRAM_PUSH_PORT` (adapter side,
  default `3101`) - both have working defaults, no action needed
  unless the port is already taken on the VPS.
- Verified live against the real Supabase DB (not mocks): inserted a
  reminder, listed it, ran the actual due-reminder join query, ran
  `checkAndDeliverDueJobs` with a fake deliver function and confirmed
  the row flipped to `sent`, cancelled a second reminder - all cleaned
  up after. Also verified a real localhost HTTP round-trip between
  `deliverToTelegram` and `startPushServer`, including a rejected
  wrong-secret request.
- 155 tests total, all passing (20 new). Clean build, clean lint,
  clean Prettier format across all 5 workspaces.

### Deployed

Confirmed by Ender 2026-09-17: rebuilt on RepoCloud, env vars
(`ENDRA_INTERNAL_SECRET`, `TELEGRAM_PUSH_URL`, `TELEGRAM_PUSH_PORT`) set
on both services, reminders working in production.

## TELEGRAM-002 (n8n) - explored, skipped for now

Ender already has a working n8n instance on RepoCloud
(`https://pmo2u6ap.rpcld.co`, project name "n8n-ender") - it's a
**shared instance** also running unrelated workflows for other
projects ("Akıllı Esnaf Kartı", "Bahiscim"). Got an n8n API key,
verified it works (`GET /api/v1/workflows` succeeds), and stored both
in `.env` as `N8N_BASE_URL` / `N8N_API_KEY` (never committed;
`.env.example` has the placeholder keys).

Building the actual Telegram-inbound n8n workflow surfaced three real
blockers, discussed with Ender, leading to the decision to skip this
for now rather than push through the risk:

1. **Core is not reachable from n8n.** Per ADR-006, `endra-core`'s
   firewall only allows SSH; Core's HTTP API is only reachable via
   localhost by `apps/telegram-adapter` on the same VPS. n8n runs as a
   separate managed container - it has no route to Core at all right
   now. _Update:_ the RepoCloud dashboard actually shows a default
   public domain for the VPS too (`vps-3737633d.vps.rcld.dev`,
   `148.251.160.63`) alongside SSH - worth re-checking with the
   RepoCloud agent whether any port is already open before assuming
   ADR-006's "SSH-only" is still accurate.
2. **Core's message endpoint has no auth.** `ENDRA_INTERNAL_SECRET` is
   only a placeholder env var today - nothing in `apps/core` checks
   it. Exposing `/api/v1/message` to the internet without real auth
   first would be a real security hole.
3. **Telegram allows only one active consumer** (long-polling XOR
   webhook) per bot token. Activating an n8n Telegram Trigger node
   would silently steal the webhook from the currently-polling
   `apps/telegram-adapter` - breaking the live, fully-working bot
   (including voice/photo/image-gen, none of which exist yet as n8n
   nodes) the moment the n8n workflow is turned on.

Decision: don't touch the Telegram path today. The credentials/API
access are saved and ready for whenever this is revisited. If/when it
is: fix (1) and (2) first (add real auth to Core, confirm and open the
right port), build the n8n workflow with parity for voice/photo/image
generation, and only then activate it - ideally right after stopping
`apps/telegram-adapter`'s polling loop on the VPS, not before.

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

## Deployed

Confirmed live in production 2026-09-15: RepoCloud agent pulled `main`,
rebuilt, ran the full test suite (135/135) on the VPS, and restarted
both `endra-core` and `endra-telegram` systemd services. `/health` and
an end-to-end pipeline check both passed.

## Other open items (not blocking)

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
