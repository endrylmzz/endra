# ENDRA Development Log

Technical milestone log. Not a detailed daily journal.

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
