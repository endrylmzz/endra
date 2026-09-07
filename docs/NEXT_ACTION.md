# NEXT ACTION

Continue task:
One of CORE-003 (user identity), CORE-004 (conversation model), or
CORE-007 (persona config) — all now unblocked.

Goal:
CORE-005 (LLMProvider interface) and CORE-006 (Anthropic implementation)
are done. ENDRA Core can now call an LLM, but nothing in the HTTP layer
does yet — `POST /api/v1/message` still returns the static stub response
from `services/message-service.ts`.

Current state:

- `packages/agent-contracts/src/llm.ts` — `LLMProvider` interface,
  `LLMGenerateRequest`/`LLMGenerateResponse` types. Deliberately minimal:
  one `generate()` method, no streaming or tool-calling yet (those get
  added when something real needs them — voice/Phase 7 for streaming,
  tool routing/Phase 3 for tool-calling).
- `apps/core/src/llm/anthropic-provider.ts` — `AnthropicProvider`
  implements `LLMProvider` using `@anthropic-ai/sdk`. Reads
  `ANTHROPIC_API_KEY` / `ANTHROPIC_MODEL` from env, or accepts them (plus
  an injectable `client` for tests) via constructor options. Throws
  clearly if no key and no injected client are provided.
- `apps/core/src/llm/anthropic-provider.test.ts` — 3 tests, all against
  an injected fake client (no real network calls, no API key needed to
  run the test suite).
- No `.env` exists yet in this repo, so nothing has actually called the
  real Anthropic API — that has not been verified end-to-end.

Why the message route wasn't wired up yet:
Wiring the LLM into `/api/v1/message` properly needs a system persona
(CORE-007) and a real response/logging shape (CORE-008/CORE-009) so the
first real LLM-backed reply isn't a half-built shortcut. Doing it now
would mean hardcoding a system prompt inline in the route, which is
exactly the kind of thing CLAUDE.md section 15 says not to do.

Next steps (pick one, in any reasonable order):

1. `CORE-007` System persona config (`config/persona/`) — needed before
   any real LLM call can represent "ENDRA" rather than a generic model.
2. `CORE-003` / `CORE-004` — user identity + conversation context model
   (still fine as light placeholders before Supabase/Phase 2 exists).
3. Once persona exists, wire `AnthropicProvider` into
   `message-service.ts` for real (this isn't its own TASKS.yaml entry —
   it naturally happens as part of CORE-007/008/009).

Important:
To actually exercise `AnthropicProvider` against the real API (not just
unit tests), a real `ANTHROPIC_API_KEY` needs to go into `.env` — ask
before assuming that's available. Don't invent a real API smoke test
that would fail/cost money without one.
