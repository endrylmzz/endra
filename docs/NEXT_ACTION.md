# NEXT ACTION

Continue task:
Ender wants to start Phase 2 (Supabase/memory) next — see "Phase 2"
below. CORE-003 (user identity) / CORE-004 (conversation model) are
still open and unblocked too, whichever comes first.

Goal:
CORE-005/006/007/011 are all done: ENDRA Core has a working LLM
provider and a persona (`config/persona/endra.md`). **OpenAI is the
project's chosen default provider** (CORE-011, decided 2026-09-14) —
Anthropic was the original CORE-006 choice but no Anthropic key was
ever provided, and Ender explicitly asked to standardize on OpenAI.
`/api/v1/message` still returns the static stub — nothing calls an LLM
yet.

Current state:

- `config/persona/endra.md` — ENDRA's system prompt, reviewed/approved
  by Ender on 2026-09-08.
- `apps/core/src/persona/load-persona.ts` — loads it, with an embedded
  fallback if the file is missing.
- `apps/core/src/llm/openai-provider.ts` — `OpenAIProvider`, the active
  default `LLMProvider` implementation. Verified with a real API call
  (2026-09-14): `gpt-5.6` resolves to `gpt-5.6-sol`. Reads
  `OPENAI_API_KEY` / `OPENAI_MODEL` from env, or an injectable `client`
  for tests (test suite never calls the real API).
- `apps/core/src/llm/anthropic-provider.ts` — `AnthropicProvider` still
  exists and is still tested, but is not the one to wire in. Left in
  place per CLAUDE.md's provider-abstraction design (not locked to one
  vendor) rather than deleted - ask Ender if he wants it removed instead.
- `.env` now has real values for `OPENAI_API_KEY`, `TELEGRAM_BOT_TOKEN`,
  `SUPABASE_URL`, and `SUPABASE_SECRET_KEY` (Supabase's new key format -
  see `.env.example`). `ANTHROPIC_API_KEY` is blank and not needed
  anymore. Nothing in the codebase auto-loads `.env` yet (no dotenv,
  no `--env-file` wired into any npm script) - the smoke test above
  was run manually with `node --env-file=.env`.

Remaining before the message route can call the LLM for real:

1. `CORE-003` / `CORE-004` — at least a minimal user identity /
   conversation context model (light placeholder is fine before
   Phase 2's real Supabase-backed version exists).
2. `CORE-009` Agent run logging — before making real (paid) LLM calls
   from Core, log at minimum: model used, token usage, duration,
   status. CLAUDE.md section 25 requirement, not optional polish.
3. Then: `message-service.ts` calls `loadPersona()` +
   `OpenAIProvider.generate()` instead of returning the static stub.
4. Decide how `.env` actually gets loaded at runtime (e.g. `node
--env-file=.env` in the `start`/`dev` scripts) — currently manual.

Also noted for later (not started, no task ID yet):
Ender wants OpenAI for voice (STT/TTS, Phase 7) and image generation
tooling too - now the same provider as Core's text reasoning, so this
may end up reusing `OpenAIProvider`'s client setup rather than needing
a second provider class. Revisit when Phase 7 / image-gen tooling
actually starts.

## Phase 2 (Supabase / memory) — starting next

Ender opened a new Supabase project and gave real credentials
(`SUPABASE_URL`, `SUPABASE_SECRET_KEY`, saved in `.env`, 2026-09-14).
Nothing in the codebase uses them yet. First real slice of Phase 2
(see `docs/TASKS.yaml` `MEMORY-*`, `docs/decisions/ADR-002-supabase-for-memory.md`):

1. `MEMORY-001` — design the initial schema (start minimal: `users`,
   `conversations`, `messages` are enough to prove the connection and
   support CORE-003/004; semantic memory/embeddings tables can follow
   once retrieval is actually being built - don't design the whole
   Phase 2 schema in one shot).
2. `MEMORY-002` — migrations in `supabase/migrations/`, applied via the
   Supabase CLI (need to confirm Ender has it installed, or install it).
3. A minimal Supabase client wrapper in `apps/core` (connection only -
   verify it can reach the project, nothing more).

Important:
Don't wire a real LLM call into the request path without at least basic
agent run logging (CORE-009) — a silent, unlogged LLM call in
production would violate CLAUDE.md's observability rule. Don't design
the full Phase 2 memory schema (working/semantic/episodic/project/
decision/task memory) in one pass - start with what CORE-003/004 and a
connectivity check actually need.
