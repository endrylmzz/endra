# ENDRA Persona Config

`endra.md` is ENDRA's system prompt - Ender's own words for who ENDRA is
and how it should behave (tone, character, boundaries). It is plain text
config, not code, so it can be edited without touching `apps/core`.

Loaded by `apps/core/src/persona/load-persona.ts` (`loadPersona()`).
Path is resolved relative to the repo root by default, or overridden via
the `ENDRA_PERSONA_PATH` env var. If the file can't be found at runtime
(e.g. a deployment that only ships `apps/core`), a minimal embedded
fallback persona is used instead of crashing.

This is CORE-007 (see `docs/TASKS.yaml`). Not yet wired into
`POST /api/v1/message` as the actual LLM system prompt - see
`docs/NEXT_ACTION.md`.
