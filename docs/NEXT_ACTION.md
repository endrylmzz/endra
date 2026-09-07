# NEXT ACTION

Continue task:
CORE-003 (user identity) or CORE-004 (conversation model) — both
unblocked. After either (or both), the message route can finally be
wired up for real.

Goal:
CORE-005/006/007 are all done: ENDRA Core has an LLM provider
(Anthropic) and a persona (`config/persona/endra.md`). `/api/v1/message`
still returns the static stub, though — nothing calls the LLM yet.

Current state:

- `config/persona/endra.md` — ENDRA's system prompt, written in Turkish
  as a first draft; Ender has not reviewed/edited it yet. Plain text
  config, not code, so it's a simple edit whenever he does.
- `apps/core/src/persona/load-persona.ts` — `loadPersona()` reads it
  (path overridable via `ENDRA_PERSONA_PATH`), with an embedded fallback
  if the file is missing at runtime.
- `apps/core/src/llm/anthropic-provider.ts` — `AnthropicProvider`,
  implements `LLMProvider`. Still never instantiated in `apps/core`'s
  actual request path (only exercised by its own unit tests).
- No real `ANTHROPIC_API_KEY` is configured in this environment yet, so
  no live call to Anthropic has been made.

Remaining before the message route can call the LLM for real:

1. `CORE-003` / `CORE-004` — at least a minimal user identity /
   conversation context model, so the LLM call has more than just the
   raw request to work with (even a light placeholder is enough for
   now — full versions land in Phase 2 with Supabase).
2. `CORE-009` Agent run logging — before making real (paid) LLM calls
   from Core, log at minimum: model used, token usage, duration,
   status. This is a CLAUDE.md section 25 requirement, not optional
   polish.
3. Then: `message-service.ts` calls `loadPersona()` +
   `AnthropicProvider.generate()` instead of returning the static stub.
4. A real `ANTHROPIC_API_KEY` needs to be added to `.env` to test this
   end-to-end against the live API — ask Ender before assuming it's
   available, and never commit `.env`.

Also noted for later (not started, no task ID yet):
Ender wants OpenAI (not Anthropic) for voice (STT/TTS, Phase 7) and
image generation tooling. Anthropic stays the default for Core's text
reasoning. When that work starts, follow the same interface-first
pattern as `AnthropicProvider` rather than overloading the text-only
`LLMProvider` interface for voice/image.

Important:
Don't wire a real LLM call into the request path without at least basic
agent run logging (CORE-009) — a silent, unlogged LLM call in
production would violate CLAUDE.md's observability rule.
