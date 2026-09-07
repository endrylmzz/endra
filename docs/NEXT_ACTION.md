# NEXT ACTION

Continue task:
CORE-003 (suggested by `npm run next` — first pending task in file order)

Goal:
CORE-001/CORE-002/CORE-010 are done: ENDRA Core is now a real Fastify
service with `POST /api/v1/message`, `GET /health`, request validation,
a global error handler, and structured logging. The next unblocked
tasks (all depend only on already-done work) are:

- `CORE-003` User identity handling
- `CORE-004` Conversation context model
- `CORE-005` LLM provider abstraction (`LLMProvider` interface) — critical priority
- `CORE-006` First LLM provider implementation (Anthropic), depends on CORE-005

Current state:
`apps/core/src/`:

- `app.ts` — `buildApp()`, builds and configures the Fastify instance
  (error handler, not-found handler, route registration). Takes
  `FastifyServerOptions` overrides for testability.
- `index.ts` — process entrypoint, calls `buildApp()` and `listen()`.
- `routes/health.ts`, `routes/message.ts` — thin route handlers only.
- `services/message-service.ts` — `handleMessage()`, the one piece of
  "business logic" so far (currently a stub that just echoes back a
  static message + the conversationId). This is where LLM/memory/tool
  orchestration will eventually be wired in — routes should stay thin.
- `app.test.ts` — Fastify `inject()`-based tests: health, valid
  message, missing fields (400), extra field rejected (400), unknown
  channel (400), unknown route (404).

`packages/agent-contracts/src/message.ts` holds the shared request/
response types (`EndraMessageRequest`, `EndraApiResponse<T>`, etc.) —
JSON-schema validation in `routes/message.ts` is kept manually in sync
with these types (no schema-to-types codegen library was added; single
endpoint, low drift risk for now — revisit if more endpoints appear).

Response envelope in use: `{ success: true, data }` /
`{ success: false, error: { code, message } }`. Health does not use
this envelope (matches CLAUDE.md section 38's simpler health shape).

Verified: `npm run build`, `npm test` (9/9 passing), `npm run lint`,
`npx prettier --check .`, and a manual curl smoke test against the
built server (`node apps/core/dist/index.js`) — health, valid message,
missing-field 400, extra-field 400, unknown-route 404 all behaved as
expected, including structured JSON request logs with per-request
`reqId`.

Next steps:

1. Pick which of CORE-003/004/005 to do next (LLM provider abstraction
   is arguably the highest-value next step — nothing in Core actually
   calls an LLM yet).
2. Whichever is picked, keep the route/service separation established
   here — no business logic directly in `routes/*.ts`.
3. Update `docs/TASKS.yaml`, `docs/PROJECT_STATUS.md`, and this file
   when the task is complete.

Important:
Still no real LLM, Supabase, n8n, or Telegram integration — that is
correct and intentional at this point in Phase 1. Do not add fake/mock
external dependencies just to make something "feel" more complete.
