# ENDRA Development Log

Technical milestone log. Not a detailed daily journal.

---

## 2026-09-20

After confirming the morning digest arrived for real in production,
Ender asked for direction suggestions ("yön önerilerinde bulun") for
what to build next. Proposed four options from the existing roadmap
context (no fresh external research this round): structured entity
tracking, a weekly/monthly digest, active project/task tracking, and a
multi-step research mode. Ender picked structured entity tracking.

Completed - `MEMORY-009` structured entity tracking:

- New `entities` (person/place/project/organization/other, unique per
  user by normalized name) and `memory_entities` (many-to-many) tables.
  Deliberately no explicit relationship type between entities -
  co-occurrence in the same memory already gives an implicit
  connection, avoiding the extra failure surface of typed relationship
  extraction for a personal single-user assistant.
- `apps/core/src/memory/entities.ts` - `findOrCreateEntity`,
  `linkMemoryToEntity`, `findEntityByName`, `listEntities`,
  `findMemoriesForEntity`.
- Extended the existing promotion-pipeline extraction call (no new LLM
  call) to also emit `entities: [{name, type}]` per memory candidate;
  `promoteMemories` links each one after saving, isolated in its own
  try/catch so a linking failure never loses the underlying memory.
- Two new read tools: `list_entities`, `recall_about` (find every
  memory linked to a named entity - "what have we discussed about X").
- Existing memories are not backfilled, only new ones going forward.

**Found and fixed a real bug via live testing**: entity name matching
used the JS default `toLowerCase()`, which maps Turkish "İ" to "i̇"
(with a combining dot) - a later plain "izmir" mention would not match
it, silently creating a duplicate entity instead of resolving to the
same one. Fixed with `toLocaleLowerCase("tr")`, verified live: a real
LLM extraction on "İzmir'de bir iş görüşmem var" produced entities
`İzmir` (place) and `ENDRA` (project); promoting it linked both, and
looking up by the plain lowercase `"izmir"` correctly matched the
stored `İzmir` entity and returned the linked memory.

324 tests total (24 new), clean build/lint/format. New migration
`20260920090000_entities.sql`, pushed live via `supabase db push`.

---

## 2026-09-19 (5)

Before deploying the six-feature batch, Ender asked what else was worth
doing first ("deploy etmeden önce başka neler yapabiliriz bunu
araştıralım"). Recommended observability over new speculative features
(CLAUDE.md section 14 - build for the next logical step, not every
hypothetical future) since the three new scheduled checks only
surfaced failures via `console.error`, invisible once deployed without
tailing VPS logs. Ender agreed ("sağlamlaştırmayı yapalım sonra deploy
komutunu ver").

Completed:

- New `proactive_runs` table (mirrors `agent_runs`) + `logProactiveRun`
  (`apps/core/src/observability/proactive-run-log.ts`). Wired into
  `checkMemoryHygiene`, `checkMorningDigest`, `checkAmbientWatch` at
  exactly two points each: a delivered notification (`status:
  "success"`), and a per-user failure (`status: "error"`) - not every
  silent no-op tick, which would be pure noise at a 30s scheduler
  interval for zero value.

307 tests total (3 new), clean build/lint/format. New migration
`20260919160000_proactive_runs.sql`, pushed live via `supabase db push`
and live-verified with a real insert/read/delete round-trip.

**Deployed and confirmed**: Ender pasted the prepared instruction (git
pull, install, build, test, restart both services, check `/health`)
into the RepoCloud DevOps AI Agent chat - confirmed OK. This covers the
entire six-feature batch from (4) below plus this hardening pass: user
preferences, decision journal, memory hygiene, morning digest, the
ambient Gmail/Calendar watcher, proactive memory connections, and
`proactive_runs` logging - all now live.

---

## 2026-09-19 (4)

After the Calendar/Gmail deploy, Ender confirmed both tools work over a
real Telegram conversation, then explicitly invited independent
research for a new product direction ("yeni yön belirleyelim,
esinlenmek adına dilediğin gibi araştırma yapabilirsin"). Researched
2026 ambient-agent patterns and proposed six ideas; Ender approved all
six ("tamam hepsini yapalım") and picked the LLM-filtered design for
the ambient watcher over a cheaper always-notify one when asked.

He also asked whether he can already make settings changes
conversationally over Telegram ("şu bilgiyi kaydet, şunu ayarlar
vb"). Answer: yes, already true as of this batch - `set_preference` /
`list_preferences` / `delete_preference` are registered tools, and
`log_decision`/`resolve_decision` work the same way; nothing further
needed there.

Completed (all six, each built standalone -> unit tested with fakes ->
live-verified against real APIs/DB before being called done):

- **User preferences activated** - `set_preference`, `list_preferences`,
  `delete_preference` tools; `listPreferences`/`deletePreference` added
  to `preferences.ts`; injected into every system prompt build.
- **Decision journal** - new `decisions` table; `log_decision` (with an
  optional scheduled follow-up reminder), `list_decisions`,
  `resolve_decision`; open decisions injected into the system prompt so
  ENDRA can resolve one from context alone. Live-verified: it
  spontaneously resolved an open decision in a separate conversation
  turn with zero explicit hints.
- **Memory hygiene** - weekly per-user sweep
  (`apps/core/src/proactive/memory-hygiene.ts`) surfacing stale
  (>30 days, importance <0.4) memories and asking whether to keep or
  delete them; `list_memories`/`delete_memory` tools alongside it.
- **Morning digest** - once-daily per-user digest
  (`apps/core/src/proactive/morning-digest.ts`) combining today's
  calendar, today's due reminders, overnight unread email, and open
  decisions into one message; skips sending when there's nothing to
  report; digest time configurable via the preferences store,
  Istanbul-timezone-aware.
- **Ambient Gmail/Calendar watcher** - every 15 minutes per user
  (`apps/core/src/proactive/ambient-watch.ts`), checks for a new unread
  email or an event starting within 45 minutes, then asks the LLM
  whether it's actually worth an unsolicited ping before delivering
  anything (the "Notify" tier of the ambient-agent pattern - the other
  proactive checks are unambiguous triggers that don't need this
  judgment call). Extracted `findDeliveryTarget` out of memory-hygiene
  and morning-digest into a shared `delivery-target.ts` once a third
  proactive check needed it.
- **Proactive memory connections** (`MEMORY-008`) - after a new memory
  is promoted, `find_related_memories` (new SQL function, pushed live)
  finds older memories that are related but not near-duplicate, then
  the LLM judges whether there's a genuine connection or contradiction
  worth mentioning. A hit is queued in preferences
  (`pending_memory_insights`, capped at 3) and surfaced once in the
  next system prompt as an internal note ENDRA can volunteer naturally,
  then cleared - a one-shot nudge, not something retried until said.

Live verification highlights (all against real APIs/DB, never by
sweeping real users - the top-level `check*` sweep functions were only
ever exercised against isolated test users or via their scoped
helpers): the ambient-watch LLM judge correctly flagged an urgent-
looking email and correctly ignored a newsletter; real Gmail/Calendar
fetches returned real data; the memory-connection judge correctly
flagged a real contradiction ("artık kahve içmiyor" vs. "her sabah
kahve içer") and a real connection, and ignored unrelated info; the new
`find_related_memories` RPC, tested against an isolated test user,
correctly matched a related memory while excluding an unrelated one.

304 tests total, all passing (57 new across `ambient-watch.test.ts`,
`delivery-target.test.ts`, plus additions to `promotion.test.ts`,
`semantic-memory.test.ts`, `message-service.test.ts`). Clean build,
clean lint, clean Prettier format.

New migrations, both pushed live via `supabase db push`:
`20260919120000_decisions.sql`, `20260919150000_find_related_memories.sql`.

None of these six map to a pre-existing `TASKS.yaml` task id - they
came out of open-ended research, not the original roadmap, so no
`TASKS.yaml` changes.

Not yet deployed to the VPS. Unlike the Calendar/Gmail batch, no new
secrets are needed - a plain git pull + rebuild + restart should cover
it, same as most earlier batches this session.

---

## 2026-09-19 (3)

Ender asked to set up Google OAuth for Gmail/Calendar and wanted a
step-by-step walkthrough. Guided him through Google Cloud Console
(project, OAuth consent screen with the three scopes, Desktop-app
OAuth client) - that part needs his own Google login, can't be
automated. Hit one real snag along the way: the first authorization
attempt got a 403 `access_denied` because the test-user addition
hadn't actually saved; he fixed it and re-ran on his own.

New architecture decision:

- ADR-008 - Google OAuth via a Desktop-app loopback flow
  (`http://127.0.0.1:<port>/callback`), done once via a local script
  Ender runs himself. Raw REST calls to Calendar/Gmail (no `googleapis`
  dependency), matching every other external integration in this
  codebase.

Completed:

- TOOLS-003 Calendar tool
- TOOLS-004 Gmail tool

Changed:

- `scripts/google-oauth-setup.mjs` (new) - one-time interactive setup:
  prints the consent URL, catches the loopback redirect, exchanges the
  code for a refresh token, writes it into `.env`. Ran once already.
- `apps/core/src/google/oauth-client.ts` (new) - `getGoogleAccessToken()`,
  mints and caches access tokens from the refresh token.
- `apps/core/src/tools/builtin/calendar.ts` (new) -
  `list_calendar_events` (read), `create_calendar_event` (write,
  requires confirmation), `delete_calendar_event` (write, requires
  confirmation).
- `apps/core/src/tools/builtin/gmail.ts` (new) - `list_emails` /
  `read_email` (read), `send_email` (`riskLevel: "critical"`, always
  requires confirmation - CLAUDE.md section 6's named example of a
  critical action). Hand-rolled MIME parsing (recursive `text/plain`
  part search) and building (RFC 2047 header encoding).
- `.env`/`.env.example` gained `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`/
  `GOOGLE_REFRESH_TOKEN`.

Verified live against Ender's real Google account (not mocks, with his
explicit go-ahead for the one action - sending a real email - that
needed it): listed the real calendar (empty), created a test event,
confirmed it appeared in the list, deleted it; listed real inbox
messages (including one from an unrelated other project) and read one
message's real decoded body; sent a real test email to Ender's own
address and read it back to confirm delivery.

**Found and fixed a real bug via that live test**: the first real send
came back with a mangled Subject line
(`ENDRA canlÃ„Â± test` instead of `ENDRA canlı test`) - raw non-ASCII
bytes in an email header need RFC 2047 encoded-words; the body doesn't
have this problem since its encoding is declared via the `Content-Type`
charset instead. Fixed with an `encodeHeaderValue()` helper, added a
test asserting the Subject line round-trips through RFC 2047 correctly,
then re-verified live with a Turkish-character subject - came back
correct.

242 tests total, all passing (21 new: `oauth-client.test.ts`,
`calendar.test.ts`, `gmail.test.ts`). Clean build, clean lint, clean
Prettier format across all 5 workspaces.

Not yet deployed, by Ender's request. **Unlike every other pending
batch this session, this one needs new secrets on the VPS** -
`GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`/`GOOGLE_REFRESH_TOKEN` - not
just a rebuild.

This closes out Phase 5 entirely and, with it, every tool-shaped item
on the original roadmap. Only Phase 8 (Web/PWA) and Phase 9 (Desktop)
remain, both explicitly out of scope for now (CLAUDE.md section 14).

Deployed and confirmed: Ender pasted a prepared instruction (git pull,
set the three new `GOOGLE_*` env vars on `endra-core`, rebuild, run
tests, restart both services, check `/health`) into the RepoCloud
DevOps AI Agent chat. Confirmed `/health` OK - this covers all six
feature batches from this session (TTS, recurring reminders + price
alerts, weather/Wikipedia/currency, retry/multi-tool-fix/capabilities,
web_search/run_code, and Calendar/Gmail), not just this last one.

---

## 2026-09-19 (2)

Ender asked: can we use OpenAI itself for things like web search
instead of getting a separate search API key - what else can we get
from OpenAI directly? Tested both live before answering.

Completed:

- TOOLS-002 Web research tool (for real this time - `search_wikipedia`
  from earlier was only a partial stand-in, correctly left `pending`)

Changed:

- `apps/core/src/tools/builtin/web-search.ts` (new) - `web_search`
  wraps OpenAI's Responses API hosted `web_search` tool. Bills through
  the already-configured `OPENAI_API_KEY` - **no separate search
  provider/key needed**, correcting the assumption recorded in the
  `key_requiring_tools_deferred.md` memory note (now updated). Real,
  current, cited results.
- `apps/core/src/tools/builtin/run-code.ts` (new) - `run_code` wraps
  the hosted `code_interpreter` tool - real sandboxed Python execution
  for anything beyond the `calculator` tool's basic arithmetic. Also
  no new key.
- Both follow `generate-image.ts`'s pattern
  (`createXTool(client: OpenAI = getDefaultClient())`); the main chat
  pipeline (`openai-provider.ts`) stays on the Chat Completions API
  unchanged - each tool makes its own separate Responses API call
  internally when invoked, so no core provider architecture change was
  needed for this.

Verified live, twice: first in isolation (`client.responses.create`
directly, confirming the API shape and that no new key is required),
then end-to-end through the actual message pipeline (not mocks) - a
real "bugün gündemde ne var" question returned a real, cited news
answer; a real "1-50 arası asal sayıların toplamı" request returned the
correct answer (328) from real executed Python.

221 tests total, all passing (6 new). Clean build, clean lint, clean
Prettier format across all 5 workspaces.

Not yet deployed, by Ender's request. No new env vars or secrets
needed - reuses `OPENAI_API_KEY`.

---

## 2026-09-19

Ender asked for a round of key-free improvements before the next
deploy, picking all of: weather-based conditional monitors, reminder
delivery retry, the multi-tool-call confirmation gap, plus one more of
my choosing. All four shipped, tested, and verified live.

Completed:

- PROACTIVE-003 (fully) - weather-based conditional monitors, alongside
  the already-shipped price alerts.

Changed:

- `apps/core/src/weather/open-meteo.ts` (new) - extracted the Open-Meteo
  fetch logic (geocoding + forecast) out of the `get_weather` tool so
  it's shared with the new monitor instead of duplicated. Also exports
  `isPrecipitating()` (a fixed WMO-code set) for the new precipitation
  alert kind.
- `apps/core/src/tools/builtin/weather-alerts.ts` (new) -
  `set_weather_alert` / `list_weather_alerts` / `cancel_weather_alert`.
  Two kinds only: `temperature` (direction + target °C) and
  `precipitation` (fires once rain/snow/a storm starts) - not a generic
  condition-expression engine.
- `apps/core/src/proactive/weather-alerts.ts` (new) - mirrors
  `price-alerts.ts`'s structure and dedup-by-status approach exactly.
- New migration `20260919090000_weather_alerts.sql`, pushed to the live
  Supabase project.
- `apps/core/src/proactive/scheduler.ts` - `startScheduler()` now also
  runs `checkWeatherAlerts()` each tick.

- **Reminder delivery retry** (a gap ADR-007 explicitly left open). New
  migration `20260919093000_reminder_retry_count.sql` adds
  `retry_count` to `scheduled_jobs`. A failed delivery now gets up to 3
  more attempts (the scheduler's own 30s tick doubles as the backoff)
  before being marked permanently `failed`, instead of giving up
  immediately. Resets to 0 on each successful recurring occurrence.

- **Multi-tool-call confirmation fix**. When one turn calls multiple
  tools and one needs confirmation, the already-executed tool's result
  was computed and kept in context, but the confirmation-ask
  instruction never told the model to actually mention it - a known v1
  gap. The instruction now explicitly asks the model to weave in any
  other tool result from the same turn. The safety guarantee is
  unchanged - only what the model is told to say changed, not how
  `ToolRouter.confirm()` executes anything.

- **`list_capabilities` tool** (new, not tied to a task id) - reads the
  tool registry itself so ENDRA can answer "neler yapabiliyorsun"
  accurately without the answer going stale as tools are added. With
  ~20 tools now registered, self-discovery earns its place.

Verified live against real APIs/DB (not mocks) for all four:
a temperature alert against Istanbul's real weather triggered and
didn't re-fire; a reminder set to always fail delivery climbed through
retry_count 0->1->2->3 across real scheduler ticks before being marked
failed; a real "saat kaç, bir de not al" message produced one reply
surfacing both the time and the confirmation question together; a real
"neler yapabiliyorsun" message got back an accurate, natural-language
capability summary.

215 tests total, all passing (30 new across the four pieces). Clean
build, clean lint, clean Prettier format across all 5 workspaces.

Not yet deployed, by Ender's request - this is the fourth pending
feature batch sitting on `main` (after TTS, recurring reminders + price
alerts, and weather/Wikipedia/currency). No new env vars or secrets
needed for any of it.

---

## 2026-09-18 (3)

Completed:

- TOOLS-001 Weather tool

Changed:

- `apps/core/src/tools/builtin/weather.ts` (new) - `get_weather` via
  Open-Meteo: free geocoding (city name -> lat/lon) + free forecast
  (current temperature/humidity/wind/weather code) - **no API key**,
  unlike essentially every other weather provider. WMO weather codes
  mapped to short Turkish descriptions via a fixed lookup table (an
  unmapped code falls back to a placeholder string rather than
  crashing).
- `apps/core/src/tools/builtin/wikipedia-search.ts` (new) -
  `search_wikipedia`, a partial stand-in for `TOOLS-002` using
  Wikipedia's free search + summary REST API. Deliberately not marked
  as closing `TOOLS-002` - it only covers static encyclopedic facts,
  not general/current-events web search, which still needs a paid
  search API key.

Verified live against both real APIs (not mocks): Open-Meteo returned
real current weather for Istanbul; Wikipedia returned a real summary
for "Mustafa Kemal Atatürk".

186 tests total, all passing (9 new: 5 for `weather.test.ts`, 4 for
`wikipedia-search.test.ts`). Clean build, clean lint, clean Prettier
format across all 5 workspaces.

Not yet deployed, by Ender's request - continuing to add features
before the next deploy. No new env vars or secrets needed.

Also added (not on the roadmap under its own task id, a natural
companion to `get_crypto_price`):

- `apps/core/src/tools/builtin/currency-conversion.ts` (new) -
  `convert_currency`, fiat-to-fiat conversion via Frankfurter's free
  ECB reference rates (no API key). `get_crypto_price` only covers
  cryptocurrencies; this fills the fiat gap (e.g. "100 dolar kaç TL").
  Verified live against the real API. 4 new tests (190 total after
  this addition).

---

## 2026-09-18 (2)

Completed:

- PROACTIVE-002 Recurring tasks
- PROACTIVE-003 Conditional monitors (price thresholds - crypto only;
  weather waits on TOOLS-001)
- PROACTIVE-005 Deduplication and cooldown logic

Changed:

- New migration `20260918090000_recurring_reminders_and_price_alerts.sql`
  - nullable `recurrence_seconds` on `scheduled_jobs`; new
    `price_alerts` table.
- `apps/core/src/tools/builtin/reminders.ts` - `set_reminder` gained
  optional `recurrenceSeconds` (e.g. 86400 for daily); validated to be
  a positive number.
- `apps/core/src/proactive/scheduler.ts` - `findDueReminders()` returns
  `dueAt`/`recurrenceSeconds` too; `checkAndDeliverDueJobs()` now
  reschedules a recurring job (`due_at + interval`, computed from the
  job's own due_at rather than "now" so a delayed tick doesn't drift
  the schedule) instead of marking it `sent`. New
  `rescheduleReminder()`.
- `apps/core/src/proactive/price-alerts.ts` (new) - the concrete,
  key-free conditional monitor: `fetchCryptoPrice()` (free CoinGecko,
  single coin/currency pair), `findPendingPriceAlerts()`,
  `checkPriceAlerts()`, `markPriceAlertTriggered()`. Dedup/cooldown
  (`PROACTIVE-005`) needed no new mechanism - a triggered or cancelled
  alert's status simply excludes it from the next tick's query.
- `apps/core/src/tools/builtin/price-alerts.ts` (new) -
  `set_price_alert` (write, no confirmation - mirrors `set_reminder`'s
  reasoning), `list_price_alerts` (read), `cancel_price_alert` (write,
  requires confirmation - mirrors `cancel_reminder`).
- `apps/core/src/proactive/scheduler.ts`'s `startScheduler()` runs
  `checkPriceAlerts()` on the same 30s tick as the reminder check - one
  scheduler, not two competing intervals.

Verified live against the real Supabase DB and a real CoinGecko call
(not mocks): set a recurring reminder due in the past, delivered it via
`checkAndDeliverDueJobs`, and confirmed the row was rescheduled to
exactly `due_at + 86400s` with status back to `pending` rather than
`sent`; set a price alert with a target far below BTC's real live
price, ran `checkPriceAlerts` and confirmed it triggered, delivered,
and was marked `triggered`; ran the check again and confirmed zero
further deliveries (dedup working as designed). All test rows cleaned
up after.

177 tests total, all passing (22 new: `price-alerts.test.ts` in both
`tools/builtin/` and `proactive/`, plus new recurrence coverage in
`reminders.test.ts` and `scheduler.test.ts`). Clean build, clean lint,
clean Prettier format across all 5 workspaces.

Not yet deployed - needs a RepoCloud rebuild/restart of both services,
same as the pending TTS feature. No new env vars or secrets required.

---

## 2026-09-18

Completed:

- VOICE-003 Text-to-speech integration
- VOICE-004 Voice response delivery back to Telegram

Changed:

- `apps/core/src/media/speech.ts` (new) - `synthesizeSpeech()` via
  OpenAI `gpt-4o-mini-tts`, requesting `response_format: "opus"`
  directly - Telegram voice notes need OGG/Opus, so this avoids any
  transcoding step. Mirrors `transcription.ts`'s structure (own file,
  own OpenAI client, same DI pattern).
- `apps/core/src/services/message-service.ts` - now tracks
  `hadVoiceInput` alongside the existing attachment-processing loop.
  When true, every text reply produced this turn (the main reply, the
  confirmation-ask reply, and the approve/reject `replyNaturally` reply)
  is also synthesized to speech and attached as an `audio` attachment -
  mirrors the turn's input modality rather than adding a new setting.
  A TTS failure is logged and falls back to text-only rather than
  breaking the reply.
- `apps/telegram-adapter/src/telegram-api.ts` - new `sendVoice()`,
  mirrors `sendPhoto()`'s multipart upload.
- `apps/telegram-adapter/src/handle-update.ts` - sends a voice note
  when the reply carries an audio attachment. When both an image and
  an audio attachment are present in the same reply (e.g. a voice
  request to draw something), sends both messages - the caption goes
  on the photo only, not duplicated onto the voice note.

Verified live against the real OpenAI API (not mocks): called
`synthesizeSpeech()` for real and checked the result decodes to a
valid OGG container (`OggS` magic bytes) of a plausible size.

161 tests total, all passing (6 new: `speech.test.ts`, three new cases
in `message-service.test.ts` covering voice-in/voice-out, TTS-failure
fallback, and no-synthesis-on-text-input, plus two new cases in
`handle-update.test.ts` for the voice-note-out and both-image-and-audio
paths). Clean build, clean lint, clean Prettier format across all 5
workspaces.

Not yet deployed - needs a RepoCloud rebuild/restart of both services.
No new env vars or secrets required.

---

## 2026-09-15 (2)

Completed:

- TOOLS-006 Reminders tool (set_reminder, list_reminders,
  cancel_reminder)
- PROACTIVE-001 Scheduled task infrastructure
- PROACTIVE-004 Notification delivery
- TOOLS-005 Notes tool (already done under TOOLARCH-009, just unmarked)
- TOOLS-007 Finance / crypto tool (same - already done as
  get_crypto_price)

New architecture decision:

- ADR-007 - Core stays channel-agnostic (ADR-004) for proactive/
  outbound delivery too. Rather than Core calling Telegram's Bot API
  directly, `apps/telegram-adapter` now exposes a tiny localhost-only
  `POST /push` endpoint (plain `node:http`, no new dependency), guarded
  by a shared secret. Core's scheduler calls that instead. No firewall
  change needed - both services already share the `endra-core` VPS
  (ADR-006) and reach each other over localhost, which is exactly the
  access n8n integration was missing (see the TELEGRAM-002 entry
  below).

Changed:

- New migration `20260915120000_scheduled_jobs.sql` - one-shot
  reminders only (`id`, `user_id`, `conversation_id`, `content`,
  `due_at`, `status`). Pushed to the live Supabase project via
  `supabase db push`. Recurrence (PROACTIVE-002) and condition-based
  monitors (PROACTIVE-003) are out of scope for this pass.
- `apps/core/src/tools/builtin/reminders.ts` (new) - `set_reminder`
  (write, no confirmation - low-stakes and easily cancelled),
  `list_reminders` (read), `cancel_reminder` (write, requires
  confirmation - mirrors `delete_note`'s reasoning: hard to undo,
  user would have to remember and re-ask for the original time).
- `apps/core/src/proactive/scheduler.ts` (new) - `findDueReminders()`
  joins `scheduled_jobs` with `conversations` to get the delivery
  channel and external conversation id; `checkAndDeliverDueJobs()`
  delivers each due job and marks it `sent`/`failed`; `startScheduler()`
  runs that on a 30s `setInterval`, started from `apps/core/src/index.ts`
  right after the HTTP server starts listening. Unknown channels are
  logged and skipped rather than erroring - only `telegram` has a
  delivery path today.
- `apps/core/src/proactive/deliver-telegram.ts` (new) - the only
  channel-specific piece on Core's side: one `fetch` call to the
  adapter's push endpoint.
- `apps/telegram-adapter/src/push-server.ts` (new) - `processPushRequest()`
  is a pure, fully-testable function (method/url/secret/body in,
  status/body out); `startPushServer()` is the thin `node:http` wrapper
  around it, bound to `127.0.0.1` only.
- `ENDRA_INTERNAL_SECRET` went from an unused placeholder (reserved
  since Phase 0) to an actual generated value, doing the job it was
  always meant for. New env vars `TELEGRAM_PUSH_URL` (Core) and
  `TELEGRAM_PUSH_PORT` (adapter), both with working defaults.

Verified live against the real Supabase DB (not mocks): inserted a
reminder, listed it, ran the actual due-reminder join query, ran
`checkAndDeliverDueJobs` with a fake deliver function and confirmed the
row flipped to `sent`, cancelled a second reminder - all cleaned up
after. Also verified a real localhost HTTP round-trip between
`deliverToTelegram` and `startPushServer`, including a rejected
wrong-secret request (401).

155 tests total, all passing (20 new). Clean build, clean lint, clean
Prettier format across all 5 workspaces.

Not yet deployed - needs a RepoCloud rebuild/restart, and
`ENDRA_INTERNAL_SECRET`/`TELEGRAM_PUSH_URL`/`TELEGRAM_PUSH_PORT` set in
each service's production environment.

---

## 2026-09-15

Completed:

- TOOLARCH-009 Multimodal input (voice transcription, image vision) +
  image generation tool + key-free tools (crypto price, list/delete
  notes)
- VOICE-001 Telegram voice note ingestion (done early, out of phase
  order, as part of the above)
- VOICE-002 Speech-to-text integration (same)

Changed:

- `packages/agent-contracts/src/message.ts` - new `EndraAttachment`
  union (`audio` | `image`); `attachments?` added to both the message
  request and response contracts.
- `packages/agent-contracts/src/llm.ts` - `LLMMessage.imageUrls?:
string[]` for vision input.
- `apps/core/src/media/transcription.ts` (new) - `transcribeAudio()`
  via OpenAI `gpt-4o-transcribe`.
- `apps/core/src/llm/openai-provider.ts` - maps `imageUrls` to OpenAI's
  `image_url` content parts for vision.
- `apps/core/src/tools/builtin/generate-image.ts` (new) -
  `generate_image` tool via OpenAI `gpt-image-1`; `riskLevel: "write"`,
  no confirmation required (idempotent, no state mutation beyond an
  API call the user just asked for).
- `apps/core/src/tools/builtin/crypto-price.ts` (new) -
  `get_crypto_price`, free CoinGecko API, no key required.
- `apps/core/src/tools/builtin/notes.ts` - renamed the existing tool
  `notes` -> `save_note`; added `list_notes` (read) and `delete_note`
  (write, requires confirmation, scoped by `id` AND `user_id`).
- `apps/core/src/services/message-service.ts` - incoming audio
  attachments are transcribed and folded into the message text before
  the LLM sees it; incoming image attachments become `imageUrls`.
  Outgoing: an image-producing tool result is diverted around the
  LLM's text channel entirely - attached to the response directly,
  with the LLM only told "image generated and sent to user" so it
  never tries to describe or repeat raw base64 as text.
- `apps/core/src/routes/message.ts` - request schema changed to
  `anyOf`: accept either a non-empty `message` or a non-empty
  `attachments` array (previously `message` alone was required).
- `apps/telegram-adapter/src/telegram-api.ts` - added `downloadFile()`
  (Telegram `getFile` + fetch, returns base64) and `sendPhoto()`
  (multipart upload) to `TelegramClient`.
- `apps/telegram-adapter/src/handle-update.ts` - detects `voice`/
  `photo` on incoming updates and forwards them as attachments; sends
  an image reply via `sendPhoto` instead of `sendMessage` when Core's
  response carries one.
- `apps/telegram-adapter` now depends on `@endra/agent-contracts` (new
  workspace dependency) to share the `EndraAttachment` type.

Verified live, end to end, against real APIs (no mocks): asked
`get_crypto_price` for BTC/ETH in USD/TRY - real CoinGecko data
returned; ran `transcribeAudio()` against a real audio file - real
Whisper-family transcript returned; sent a real image through the
vision path - `gpt-5.6` returned a sensible reply; ran
`generate_image` - `gpt-image-1` returned a real generated image. All
four succeeded on the first real API call.

135 tests total, all passing (19 new since the last checkpoint: 1 for
transcription, 3 for image generation, 4 for crypto price, plus
extended coverage for notes list/delete, message-service attachment
handling, the Fastify route's `anyOf` schema, and the Telegram
adapter's voice/photo/sendPhoto paths). Clean build, clean lint, clean
Prettier format across all 5 workspaces.

Deployed and verified: RepoCloud agent pulled `main` (`29cb308` ->
`e793f55`), ran `npm install`/`npm run build`/`npm test` (135/135) on
the VPS, restarted both `endra-core` and `endra-telegram` systemd
services. `/health` returned `{"status":"ok","version":"0.1.0"}` and an
end-to-end pipeline check got a real reply, confirming production is
live on the new code.

Completed:

- MEMORY-008 Project memory support (no code change - `type: "project"`
  in the `memories` table/pipeline already worked identically to every
  other memory type; just needed to be marked done)

Explored, not completed:

- TELEGRAM-002 (n8n Telegram trigger workflow). Got access to Ender's
  existing RepoCloud n8n instance (`n8n-ender`, shared with unrelated
  "Akıllı Esnaf Kartı"/"Bahiscim" projects) and verified an n8n API key
  works. Stopped before building the actual workflow once three real
  blockers surfaced: Core's HTTP API isn't reachable from n8n (separate
  container from the `endra-core` VPS, and per ADR-006 that VPS's
  firewall is SSH-only); Core's `/api/v1/message` has no auth
  (`ENDRA_INTERNAL_SECRET` is an unused placeholder); and activating an
  n8n Telegram Trigger would silently steal the bot's webhook from the
  currently-polling, fully-working `apps/telegram-adapter` (which has
  voice/photo/image-gen support that doesn't exist in n8n form). Decided
  with Ender to skip this for now rather than risk breaking the live
  bot for a migration with no immediate functional upside. `N8N_BASE_URL`
  and `N8N_API_KEY` saved in `.env` for whenever this is revisited. Also
  noted: the RepoCloud VPS dashboard shows a default public domain
  (`vps-3737633d.vps.rcld.dev`) in addition to SSH access - worth
  re-checking whether ADR-006's "SSH-only" firewall assumption still
  holds before the next attempt.

---

## 2026-09-14 (9)

Completed:

- TOOLARCH-008 Wire tool-calling into the live message pipeline

Changed:

- Extended `LLMProvider`'s contract (`LLMMessage.role` now includes
  `"tool"`, `toolCallId`/`toolCalls` fields; `tools` on the request,
  `toolCalls` on the response - all optional, so `AnthropicProvider`
  (dormant, unused) needed only a small fix to keep compiling, not a
  real tool-calling implementation).
- `OpenAIProvider` now maps to/from OpenAI's function-calling shape.
  **Found and fixed a real API bug**: `gpt-5.6` returns 400 ("Function
  tools with reasoning_effort are not supported... set reasoning_effort
  to 'none'") when `tools` are sent without also setting
  `reasoning_effort: "none"` - only discovered via the live smoke test,
  not caught by any mocked unit test (the mocks don't know OpenAI's
  real validation rules). Fixed by always setting it when tools are
  present.
- `apps/core/src/tools/default-registry.ts` - the production tool
  registry/router (`get_current_time`, `calculator`, `notes`).
- `apps/core/src/tools/confirmation-intent.ts` - keyword-based yes/no
  detection for responding to a pending approval mid-conversation, no
  extra LLM call needed for something this simple; "unclear" is the
  fail-safe default.
- `approvals.ts` gained `findPendingApproval()` (most recent pending,
  unexpired approval per conversation) - also refactored the repeated
  row-to-camelCase mapping into one `toApproval()` helper while there.
- Rewrote `message-service.ts`'s `handleMessage()`: checks for a
  pending approval first (approve/reject/unrelated via
  `detectConfirmationIntent`); otherwise runs the LLM with tools in a
  loop (max 4 iterations) until a final answer or a
  confirmation-required tool call.
- **UX pass, after the first live test showed robotic output**:
  confirmation questions and "done"/"cancelled" replies are now phrased
  by the LLM itself (one extra text-only `generate()` call, tools
  intentionally omitted so it can't try another tool call instead of
  answering) instead of canned template strings. The first version
  literally said `"Saves a short note for later.
({"content":"..."})."` - an English tool description with a raw JSON
  blob glued into a Turkish sentence, which doesn't fit ENDRA's persona
  at all. The actual safety mechanism (`ToolRouter.confirm()` always
  executing with the arguments stored at approval time) was never
  touched - only how things are phrased.
- Verified live end-to-end, twice (once before, once after the UX
  pass): time question -> real result; math question -> real result;
  note request -> confirmation question -> "evet" -> note actually in
  Supabase, natural reply; second note request -> "hayır" -> note
  correctly NOT saved, natural reply.
- 116 tests total now (up from 99): `message-service.test.ts` rewritten
  with dedicated tool-calling and pending-confirmation-response
  sections, plus new tests for `confirmation-intent.ts`,
  `approvals.findPendingApproval`, and `OpenAIProvider`'s
  tool-definition/tool-call mapping.

Problems:

- The `gpt-5.6` + `reasoning_effort` + `tools` conflict above - real
  API behavior no mock could have caught; the live smoke test is what
  found it.
- The robotic first-draft confirmation UX above - not a bug exactly,
  but a real quality issue caught the same way (by actually looking at
  what came back from a live call, not just checking `success: true`).

Next:

- **Not deployed to production yet.** Trigger a RepoCloud rebuild, then
  verify once via real Telegram messages. After that, Ender's choice on
  what's next - see `docs/NEXT_ACTION.md`.

---

## 2026-09-14 (8)

Completed:

- TOOLARCH-001 through 007 (EndraTool contract, registry, router,
  permission/risk levels, confirmation system, tool run logging, first
  test tools) - all of Phase 3.

Changed:

- Researched MCP (Model Context Protocol) and current agent tool-use
  practice before building: confirmed MCP standardizes tool discovery/
  execution (OpenAI's Agents SDK officially supports it too) but has
  **no standard authorization/confirmation layer** - that part stayed
  fully custom, matching CLAUDE.md's original section 20 design.
- Added `EndraTool`/`ToolExecutionContext`/`ToolRiskLevel`/`ToolResult`
  to `packages/agent-contracts`. Had to add `ToolExecutionContext` to
  `execute()` beyond CLAUDE.md's original sketch - discovered while
  implementing `notes` that a tool needs to know _which user_ it's
  acting for, and `execute(input)` alone can't express that.
- Added `apps/core/src/tools/`: `registry.ts`, `router.ts` (dispatch +
  confirm, with confirm always using the arguments stored at approval
  time, never new ones), `approvals.ts` (+ new `approvals` table,
  5-minute TTL), `tool-run-log.ts` (+ new `tool_runs` table, same
  never-throws pattern as `agent_runs`).
- Added `builtin/get_current_time.ts`, `builtin/calculator.ts` (own
  safe recursive-descent arithmetic parser - deliberately no `eval()`
  on LLM-influenced input), `builtin/notes.ts` (write,
  `requiresConfirmation: true`, + new `notes` table - chosen
  specifically to exercise the full confirmation flow).
- Added `mcp-client.ts`: `connectMcpServer()` (stdio transport) +
  `loadMcpTools()` (wraps an MCP server's tools as `EndraTool`s).
  Documented clearly in the file that MCP tools default to
  read/no-confirmation since MCP has no risk metadata - only safe for
  a reviewed server; real future MCP servers need explicit overrides.
- 21 new tests (registry, approvals, tool-run-log, router, 3 built-in
  tools, mcp-client) - all against injected fakes, no real network.
- Verified live, twice: (1) the full router flow against real Supabase
  - read tool executes immediately; write tool (`notes`) creates a
    pending approval instead of executing; confirming executes with the
    stored arguments and actually inserts the note; confirming the same
    approval a second time is correctly refused; full audit trail
    visible in `tool_runs`. (2) A **real MCP server**
    (`@modelcontextprotocol/server-everything`, official reference/test
    server, spawned via `npx` over stdio - no account needed) - listed
    its 13 real tools, called `get-sum` through the router, got the
    correct real result back.

Problems:

- None in the actual code. My own smoke-test script passed a
  non-UUID string as `conversationId` when calling the MCP tool, which
  made the `tool_runs` insert fail - `logToolRun`'s
  never-throw-on-its-own-failure design caught it exactly as intended
  (logged to `console.error`, the actual tool call still succeeded and
  returned the correct result). A nice unplanned confirmation that the
  fail-safe logging pattern works, not a bug.

Next:

- Real decision: wire tool-calling into the live `message-service.ts`
  LLM loop now, or keep building elsewhere first. Deliberately not
  done in this pass - see `docs/NEXT_ACTION.md`.

---

## 2026-09-14 (7)

Completed:

- MEMORY-004 User preferences storage
- MEMORY-005 Semantic memory storage and embeddings
- MEMORY-006 Memory retrieval (multi-signal fusion)
- MEMORY-007 Memory promotion pipeline

Changed:

- Researched 2026 AI agent memory architecture practice before
  building (mem0.ai's "State of AI Agent Memory 2026" and related
  sources): the key finding was that multi-signal fusion (semantic +
  keyword + importance + recency) measurably beats vector-similarity-
  alone retrieval, and "ADD-only" extraction (both user statements and
  assistant confirmations are memory candidates) is the proven
  extraction pattern. Both implemented directly rather than adopting a
  memory framework (Mem0, Zep, etc.) - consistent with this project's
  established preference for small, self-written, well-tested code
  over adding frameworks (same reasoning as the Telegram adapter using
  raw fetch instead of a library).
- Added migrations: `preferences` table; `memories` table (pgvector
  `embedding`, generated `tsvector` column for keyword search);
  `search_memories()` SQL function (fused ranking: 45% semantic + 25%
  keyword rank + 15% importance + 15% recency decay); `find_similar_memory()`
  (pure cosine similarity, separate from the fused score, for dedup).
- Added `apps/core/src/memory/{preferences,embeddings,semantic-memory,promotion}.ts`.
  `extractMemoryCandidates()` makes one LLM call per exchange asking
  what's worth remembering (JSON output, empty array on any parse
  failure - a malformed response just means "nothing extracted this
  turn," never a crash). `promoteMemories()` checks each candidate
  against `find_similar_memory` (threshold 0.92) before saving.
- Wired into `message-service.ts`: `searchMemories()` runs before the
  LLM call (relevant memories get appended to the system prompt);
  extraction+promotion run **after** replying, fire-and-forget
  (`void promise.catch(...)`, never awaited) so a slow or failing
  memory pipeline can never delay or break the actual reply.
- `MessageServiceDeps` grew to include `searchMemories`,
  `extractMemoryCandidates`, `promoteMemories` - same injectable-deps
  pattern as everything else, so the service stays testable without
  hitting OpenAI/Supabase. 4 new tests for `handleMessage` covering
  memory-augmented prompts and the fire-and-forget behavior (using a
  microtask flush to let the background chain run before asserting).
- Verified live end-to-end (real OpenAI + Supabase): a two-turn
  conversation ("favori rengim mavidir" -> unrelated topic) where the
  stated preference was correctly promoted to long-term memory and
  surfaced again in the second turn via semantic search, not just raw
  conversation history.

Problems:

- A test-script race (not a code bug): my own smoke-test script
  deleted its throwaway user row before the fire-and-forget promotion
  from the _second_ message had finished, causing an expected foreign-
  key error in that background job. Fixed by waiting longer before
  cleanup in the test script; not a production concern since real
  usage never deletes the user mid-conversation.

Next:

- Phase 3 (Tool Architecture), built around MCP - see
  `docs/NEXT_ACTION.md` for the plan and the research behind the MCP
  decision.

---

## 2026-09-14 (6)

Completed:

- TELEGRAM-009 Deploy Core + Telegram adapter to production

Changed:

- Made `github.com/endrylmzz/endra` public (was private) so RepoCloud's
  deploy form could clone it directly - verified first with
  `git log --all -p` grepping for known secret/token fragments across
  full history, found none (only a Telegram user id, not a credential).
- Renamed local branch `master` → `main` to match GitHub convention
  before the initial push.
- Added a root `start` script (`node apps/core/dist/index.js`) - a
  monorepo has no single obvious entry point for a generic deploy
  tool otherwise.
- Deployed via RepoCloud's "Deploy App to Virtual Private Server" flow
  (their AI agent handles provisioning + setup from custom
  instructions describing the build/start/health-check contract).
  Result: both apps run as systemd services on a $6/mo VPS, dedicated
  non-root user, firewall deny-all except SSH, journal log rotation,
  nightly auto-update cron that pulls `main` and rebuilds.
- Pasted real secrets into the RepoCloud agent's chat once (Ender did
  this, not committed anywhere) to populate `/opt/endra/.env` on the
  server.
- Fixed a live bug: two Telegram long-polling consumers (the VPS and a
  local dev instance I'd left running) fought over the same bot token
  ("Conflict: terminated by other getUpdates request"). Killed the
  local processes - not a code bug, an operational one.
- Fixed a real formatting bug found via live use: Telegram showed
  literal `**bold**`/`- lists` instead of rendering them, since
  `sendMessage` never set `parse_mode`. Now sends with
  `parse_mode: "Markdown"`, falling back to plain text if Telegram's
  strict parser rejects the LLM's output. 2 new tests.
- Verified via Supabase query (not just "Ender says it worked") that a
  real Telegram message produced a real `agent_runs` row with
  `status: "success"` after the fix.

Problems:

- The Telegram getUpdates conflict above - resolved, noted for future
  sessions: never leave a local `apps/telegram-adapter` running once
  production is handling the same bot token.
- RepoCloud's "Coolify VPS" marketplace listing turned out to be a
  dead end - it just links to Coolify's own generic external install
  docs rather than provisioning anything through RepoCloud. The actual
  path that worked was RepoCloud's own native "Deploy App to Virtual
  Private Server" form (GitHub repo → dedicated VPS), unrelated to the
  Coolify listing.

Next:

- Ender's choice: deeper memory (Phase 2), tools (Phase 3), or
  something that comes up from actually using ENDRA day to day now.

---

## 2026-09-14 (5)

Completed:

- TELEGRAM-001 Telegram bot integration setup
- TELEGRAM-003 User authorization
- TELEGRAM-004 Inbound message handling into ENDRA Core
- TELEGRAM-005 Reply delivery back to Telegram
- TELEGRAM-006 Duplicate update prevention
- TELEGRAM-007 Typing indicator state
- TELEGRAM-008 Error handling and message length handling

(`TELEGRAM-002`, the n8n workflow, intentionally NOT done - see
ADR-005.)

Changed:

- Recorded ADR-005: Telegram is wired directly into Core via a new
  standalone adapter (`apps/telegram-adapter`), bypassing n8n for now.
  RepoCloud/n8n access was never set up in this project, and Ender
  wanted a working bot today rather than waiting on that. Long polling
  needs no public URL/webhook, so this needed zero deployment to test.
- Added `apps/telegram-adapter`: `telegram-api.ts` (raw fetch-based
  Telegram Bot API client - no library dependency, deliberately, since
  it's a temporary bridge and the API surface needed is tiny),
  `authorization.ts` (allowlist check, fail-closed), `core-client.ts`
  (calls Core's existing `/api/v1/message`), `handle-update.ts` (the
  actual per-message logic, injectable deps for testing),
  `index.ts` (the long-polling loop).
- 13 new tests across the adapter (chunking, authorization, Core
  client, and the full handle-update flow with injected fakes) - none
  touch the real Telegram or Core APIs.
- Found and fixed a real problem during live testing: the Telegram bot
  token given earlier in this project's chat history had been revoked
  (`getMe` returned 401 directly from Telegram, confirmed with a raw
  curl call before suspecting our own code) - Ender regenerated it via
  BotFather and gave the new one.
- Captured Ender's real Telegram user id (`1028764118`) from an
  "unauthorized" log line the first time he messaged the bot with an
  empty allowlist, then set `ENDRA_ALLOWED_TELEGRAM_USERS` to it.
- Verified live, end to end: Ender sent real messages via Telegram
  (@endraaibot) and received real ENDRA replies, generated through the
  full pipeline built earlier this session (identity, memory,
  persona, OpenAI, logging).

Problems:

- The originally-provided Telegram bot token was invalid (revoked).
  Not a bug in this project's code - confirmed independently with a
  direct `curl .../getMe` call before touching any adapter code.
- Neither `apps/core` nor `apps/telegram-adapter` is deployed anywhere
  - both were started manually and are only running because the
    processes haven't been killed. No supervisor, no 24/7 guarantee yet.
    Whether RepoCloud can host a custom app (not just marketplace apps
    like n8n) is still an open question for Ender to check.

Next:

- Ender's choice: deeper memory (Phase 2), tools (Phase 3), or sort
  out where Core actually gets deployed for 24/7 use. See
  `docs/NEXT_ACTION.md`.

---

## 2026-09-14 (4)

Completed:

- CORE-008 Standard ENDRA response format (confirmed already satisfied
  by the existing envelope, no changes needed)
- **Phase 1 (ENDRA Core) - fully done.**

Changed:

- Rewrote `services/message-service.ts`: `handleMessage()` now runs
  the real pipeline (identity → history → LLM → persist → log)
  instead of returning a static stub. Takes an optional `deps` param
  for dependency injection (same pattern used everywhere else in this
  codebase), so it stays unit-testable without hitting OpenAI or
  Supabase.
- `routes/message.ts` now awaits `handleMessage` (it's async now).
- Added `services/message-service.test.ts` (2 tests, injected fakes).
- Updated `app.test.ts` to `vi.mock` the message-service module,
  keeping its tests as pure HTTP/routing tests instead of hitting real
  external services.
- Verified live, twice: sent two real messages through the running
  server against the real OpenAI + Supabase stack. The persona showed
  up correctly in the reply, and the second message correctly recalled
  the first one, proving conversation history actually works, not just
  that it compiles. Cleaned up all smoke-test rows afterward (users,
  conversations, messages cascade-deleted; agent_runs rows had to be
  deleted separately since `ON DELETE SET NULL` orphans them instead
  of removing them - worth remembering for future manual cleanup).

Problems:

- None blocking. Noted for later: `agent_runs.conversation_id`/`user_id`
  use `ON DELETE SET NULL` (keep the audit log even if the
  conversation/user is later deleted) rather than `CASCADE` - correct
  design choice, but means deleting a conversation doesn't clean up
  its agent_runs rows automatically.

Next:

- Real fork in the road: deeper into Phase 2 (memory), Phase 3 (tool
  architecture), or jump to Phase 4 (Telegram - Core already works, so
  this would give Ender a usable interface sooner than the original
  phase order planned). See `docs/NEXT_ACTION.md`.

---

## 2026-09-14 (3)

Completed:

- CORE-003 User identity handling
- CORE-004 Conversation context model
- MEMORY-003 Conversation and message persistence layer
- CORE-009 Agent run logging

Changed:

- Added `supabase/migrations/20260914181528_add_identity_columns.sql`
  (`users.external_id`, unique constraints) and
  `.../20260914181804_add_agent_runs.sql` (`agent_runs` table).
- Added `apps/core/src/identity/resolve-identity.ts`
  (`resolveIdentity()`) - find-or-create a user + conversation row
  from a request's channel/external ids. Deliberately does not try to
  link one person across multiple channels into one identity yet -
  not a real need until a second channel (Telegram) exists.
- Added `apps/core/src/memory/messages.ts` (`saveMessage`,
  `getRecentMessages`) - the working-memory layer, separate from
  promoted long-term memory (MEMORY-005+).
- Added `apps/core/src/observability/agent-run-log.ts`
  (`logAgentRun()`) - logs provider/model/timing/tokens/status.
  Swallows its own failures (logs to `console.error`, never throws) so
  a logging outage can't take down the actual user-facing response.
- All four pieces tested with fake/injected Supabase clients (test
  suite: 28 tests total now), then separately verified end-to-end
  against the real remote database with throwaway smoke-test rows
  (created, checked, deleted).

Problems:

- None.

Next:

- Wire identity + persistence + `OpenAIProvider` + persona + agent run
  logging together in `message-service.ts` so `/api/v1/message`
  returns a real reply instead of the stub - see `docs/NEXT_ACTION.md`,
  already in progress.

---

## 2026-09-14 (2)

Completed:

- MEMORY-001 Initial Supabase schema design (minimal slice)
- MEMORY-002 Supabase migrations (mechanism + first migration)

Changed:

- Installed the Supabase CLI as a root devDependency (`npm i -D
supabase`) instead of a system package manager (Scoop wasn't
  installed and installing it felt like more than this needed).
- Logged in via a Supabase personal access token (Ender generated one
  from dashboard/account/tokens, since `supabase login`'s browser flow
  doesn't work in this non-TTY environment) and linked the CLI to the
  real remote project (`gokogcspheruupuiipjl`) using the project's DB
  password. Neither the access token nor the DB password is stored in
  the repo - the CLI keeps its own local config outside the project.
- Added `supabase/migrations/20260914180509_init_schema.sql`: `users`,
  `conversations`, `messages` tables, RLS enabled with no policies
  (secret key bypasses RLS; anon/publishable key gets nothing). Applied
  to the real database with `supabase db push`, confirmed with
  `supabase migration list` (local/remote timestamps match) and a
  direct REST query.
- Added `apps/core/src/db/supabase-client.ts` (`getSupabaseClient()`,
  lazy singleton) + 2 tests. Verified with a real query against the
  live database (empty `users` table, no error) - second real external
  API call made in this project, after the OpenAI one.
- Did NOT design the full Phase 2 schema (memories, embeddings,
  projects, tasks, tool_runs, agent_runs, approvals, scheduled_jobs) -
  deliberately incremental, per `docs/NEXT_ACTION.md`.

Problems:

- `supabase login`'s interactive browser flow fails in this sandboxed
  shell (`LegacyLoginMissingTokenError`, non-TTY). Worked around with
  `supabase login --token <personal-access-token>` instead.

Next:

- CORE-003/004 (user identity, conversation model) or MEMORY-003
  (conversation/message persistence layer) - see `docs/NEXT_ACTION.md`.

---

## 2026-09-14

Completed:

- CORE-011 OpenAI LLM provider (project decision: OpenAI over Anthropic)

Changed:

- Project decision: use OpenAI as Core's default LLM provider, not
  Anthropic. No Anthropic key was ever provided after being asked
  twice; Ender explicitly asked to standardize on OpenAI instead.
- Added `apps/core/src/llm/openai-provider.ts` (`OpenAIProvider`,
  using the `openai` npm package), same pattern as `AnthropicProvider`:
  injectable client for tests, reads `OPENAI_API_KEY`/`OPENAI_MODEL`
  from env. Default model `gpt-5.6`.
- Added 3 tests (missing-key error, successful mapping, empty-content
  fallback) - all against an injected fake client.
- Verified with one real API call (Ender approved the cost): `gpt-5.6`
  resolved to `gpt-5.6-sol`, got a correct response back. First real
  external API call made in this project.
- `AnthropicProvider` was left in place (not deleted) per the existing
  provider-abstraction design - it's just not the active default.
- Ender gave real Supabase credentials (new project, new
  `sb_secret_...` key format) and a Telegram bot token. Saved both to
  `.env` (gitignored, never committed). Renamed
  `SUPABASE_SERVICE_ROLE_KEY` → `SUPABASE_SECRET_KEY` in `.env.example`
  and `scripts/doctor.mjs` to match Supabase's current key naming
  (legacy `service_role` JWT keys are being deprecated).

Problems:

- None.

Next:

- Phase 2 (Supabase/memory) - see `docs/NEXT_ACTION.md`. CORE-003/004
  still open too.

---

## 2026-09-08

Completed:

- CORE-007 System persona config

Changed:

- Added `config/persona/endra.md` — ENDRA's system prompt (Turkish:
  alter-ego framing, tone, pushes back on weak ideas, always confirms
  risky/irreversible actions, uses tools instead of just describing
  them). Drafted per CLAUDE.md section 15, reviewed and approved by
  Ender on 2026-09-08 with no changes requested. Plain text, not code,
  so it's editable without touching Core.
- Added `apps/core/src/persona/load-persona.ts` (`loadPersona()`) to
  read it at runtime, with an embedded fallback persona if the file is
  missing (e.g. a deployment that only ships `apps/core`).
- Added 2 tests: loads the real file, falls back when the configured
  path doesn't exist.
- Noted a forward-looking decision (not yet implemented): Ender wants
  OpenAI, not Anthropic, for voice (Phase 7) and image generation
  tooling. Recorded in `docs/NEXT_ACTION.md` and in cross-session
  memory so it isn't lost before Phase 5/7 work starts.

Problems:

- None.

Next:

- CORE-003 / CORE-004, then wire persona + AnthropicProvider into
  `/api/v1/message` (needs CORE-009 agent run logging first — see
  `docs/NEXT_ACTION.md`).

---

## 2026-09-07 (3)

Completed:

- CORE-005 LLMProvider abstraction interface
- CORE-006 First LLM provider (Anthropic)

Changed:

- Added `LLMProvider` / `LLMGenerateRequest` / `LLMGenerateResponse` to
  `packages/agent-contracts/src/llm.ts`. Scoped to a single `generate()`
  call on purpose — no streaming or tool-calling yet, since nothing
  needs them until Phase 7 (voice) and Phase 3 (tools) respectively.
- Added `apps/core/src/llm/anthropic-provider.ts` (`AnthropicProvider`,
  using `@anthropic-ai/sdk`). Reads `ANTHROPIC_API_KEY` /
  `ANTHROPIC_MODEL` from env by default; accepts an injectable client
  for testing so the test suite never calls the real API.
- Added 3 tests for the provider (missing-key error, successful
  mapping, empty-content fallback).
- Did NOT wire the provider into `POST /api/v1/message` yet — see
  `docs/NEXT_ACTION.md` for why (persona/response-format/logging
  should land first).

Problems:

- None. No real Anthropic API call has been made yet (no `.env` /
  `ANTHROPIC_API_KEY` configured in this environment) — only verified
  against an injected fake client.

Next:

- CORE-003 / CORE-004 / CORE-007 (see `docs/NEXT_ACTION.md`).

---

## 2026-09-07 (2)

Completed:

- CORE-001 ENDRA Core API skeleton (`POST /api/v1/message`)
- CORE-002 Request/response schema types
- CORE-010 Health check endpoint (`GET /health`)

Changed:

- Added Fastify to `apps/core` as the HTTP framework.
- `apps/core/src/app.ts` builds the Fastify instance: structured JSON
  logging (pino) with a UUID `reqId` per request, a global error
  handler returning a standard `{ success: false, error }` envelope,
  and a not-found handler for unmatched routes.
- `POST /api/v1/message` validates its body against a JSON schema
  (channel/userId/conversationId/message, `additionalProperties:
false`) and delegates to `services/message-service.ts` — routes stay
  thin, business logic is separated for future Core pipeline work.
- `GET /health` returns `{ status, version, uptime }`.
- Added `EndraMessageRequest` / `EndraApiResponse<T>` etc. to
  `packages/agent-contracts/src/message.ts` as the shared message
  envelope contract.
- Added 9 tests total (6 new, via Fastify `inject()`) covering health,
  success, validation failure, extra-field rejection, unknown channel,
  and 404.

Problems:

- Fastify's default ajv config sets `removeAdditional: true`, which
  silently strips unknown body fields instead of rejecting them —
  defeats `additionalProperties: false`. Fixed by passing
  `ajv: { customOptions: { removeAdditional: false } }` in `buildApp()`.
  Caught by manual curl testing against the built server, not by the
  original test suite — added a dedicated test afterward.

Next:

- CORE-003 / CORE-004 / CORE-005 — user identity, conversation model,
  or LLM provider abstraction (all unblocked; see `docs/NEXT_ACTION.md`).

---

## 2026-09-07

Completed:

- FOUNDATION-001 through FOUNDATION-011 (Phase 0 — Foundation, complete)

Changed:

- Initialized git repository and monorepo structure (`apps/`, `packages/`,
  `n8n/`, `supabase/`, `docs/`, `scripts/`, `config/persona/`)
- Set up npm workspaces with TypeScript project references
  (`packages/shared`, `packages/agent-contracts`, `packages/tool-sdk`,
  `apps/core`), each with a placeholder module and a Vitest smoke test
- Added ESLint (flat config) + Prettier
- Added the documentation system: `CLAUDE.md`, `docs/ARCHITECTURE.md`,
  `docs/PROJECT_STATUS.md`, `docs/TASKS.yaml`, `docs/NEXT_ACTION.md`, this
  file, and `docs/decisions/` (ADR-001 through ADR-004)
- Added `scripts/status.mjs`, `scripts/next.mjs`, `scripts/doctor.mjs`
  (all read `docs/TASKS.yaml` via a small purpose-built parser in
  `scripts/lib/tasks.mjs`)
- Added `.env.example` and `.gitignore`

Problems:

- None.

Next:

- CORE-001 — ENDRA Core API skeleton (`POST /api/v1/message`)
