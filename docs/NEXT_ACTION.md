# NEXT ACTION

Continue task:
None in progress. Phase 1 (ENDRA Core) is fully done. Next is a real
choice between three directions - see below.

Goal:
Nothing left to unblock in Core - `POST /api/v1/message` is a real,
working, persona-driven, persisted, logged pipeline. What's next is
about which capability to build on top of it.

Current state:

- `apps/core/src/services/message-service.ts` — `handleMessage()`,
  the full pipeline: `resolveIdentity` → `getRecentMessages` →
  `saveMessage` (user) → `OpenAIProvider.generate()` (with
  `loadPersona()` as system prompt) → `saveMessage` (assistant) →
  `logAgentRun`. Takes an optional `deps` param (same
  injectable-dependency pattern as every other module) so it's
  testable without hitting real APIs - see
  `services/message-service.test.ts`.
- `apps/core/src/app.test.ts` mocks `services/message-service.js`
  entirely (`vi.mock`) so HTTP-level tests stay pure routing tests;
  the service's own logic is tested separately with injected fakes.
- Verified against the real live stack (not just mocks): sent two real
  messages through the running server to the real OpenAI + Supabase -
  second message correctly recalled the first (`"Biraz önce sana ne
sordum, hatırlıyor musun?"` → correct answer), confirming
  conversation history actually works end-to-end. All smoke-test rows
  were deleted afterward - nothing fake left in the real database.
- `.env` still isn't auto-loaded by any npm script - manual smoke
  tests used `node --env-file=.env`. Not wired into `start`/`dev` yet.

## What's next - three real options

**A. Deeper into Phase 2 (Memory)** — `MEMORY-004` (preferences),
`MEMORY-005` (semantic memory + embeddings), `MEMORY-006` (retrieval
ranking), `MEMORY-007` (promotion pipeline). Makes ENDRA remember
things across conversations, not just within one - the core "second
brain" value proposition (CLAUDE.md section 1/21).

**B. Phase 3 (Tool Architecture)** — `EndraTool` contract, registry,
router, permission/risk levels, confirmation system. Needed before
ENDRA can _do_ anything beyond talk (weather, web search, calendar,
Gmail, reminders - all of Phase 5 depends on this existing first).

**C. Phase 4 (Telegram)** — the message pipeline already works, so
wiring Telegram now would let Ender actually use ENDRA day-to-day from
his phone, ahead of where the original roadmap put it (Phase 4 was
planned after Phase 3). `TELEGRAM_BOT_TOKEN` is already sitting in
`.env`, unused. Real, tangible value sooner, at the cost of
deviating from the planned phase order (same kind of deliberate
reordering already done once this session for Phase 2).

No task is marked `in_progress` right now - whichever direction gets
picked, mark it in `docs/TASKS.yaml` before starting, per the usual
task cycle.

Important:

- Keep doing real end-to-end smoke tests (not just unit tests with
  fakes) before marking anything `done`, the way every piece has been
  verified this session - it's caught real bugs before (the
  `removeAdditional` Fastify default, back in CORE-001).
- Don't design/build more than the next concrete task needs - this
  session already avoided over-building the Phase 2 schema and the
  `LLMProvider` interface (no streaming/tool-calling) for exactly this
  reason.
