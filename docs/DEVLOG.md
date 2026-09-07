# ENDRA Development Log

Technical milestone log. Not a detailed daily journal.

---

## 2026-09-08

Completed:

- CORE-007 System persona config

Changed:

- Added `config/persona/endra.md` — a first-draft ENDRA system prompt
  (Turkish: alter-ego framing, tone, pushes back on weak ideas, always
  confirms risky/irreversible actions, uses tools instead of just
  describing them). Drafted per CLAUDE.md section 15; Ender has not
  reviewed/edited it yet. Plain text, not code, so it's editable
  without touching Core.
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
