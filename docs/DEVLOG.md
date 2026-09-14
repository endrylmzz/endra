# ENDRA Development Log

Technical milestone log. Not a detailed daily journal.

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
