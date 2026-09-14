# NEXT ACTION

Continue task:
CORE-003 (user identity) or CORE-004 (conversation context model) —
both unblocked, and now there's a real `users`/`conversations` schema
in Supabase for them to build on. `MEMORY-003` (conversation/message
persistence layer) is the natural next Phase 2 step after either.

Goal:
Phase 1's LLM/persona pieces are done (OpenAI provider, persona
config). Phase 2 now has a working Supabase connection and initial
schema. Nothing in `apps/core` uses the database yet, and
`/api/v1/message` still returns the static stub.

Current state - Phase 1:

- `apps/core/src/llm/openai-provider.ts` — active default `LLMProvider`.
  `apps/core/src/llm/anthropic-provider.ts` still exists, unused, not
  deleted.
- `config/persona/endra.md` + `apps/core/src/persona/load-persona.ts` —
  done, approved.
- Not done yet: CORE-003, CORE-004, CORE-008 (standard response format
  - arguably already satisfied by the envelope from CORE-001, revisit
    if it still looks incomplete once wiring happens), CORE-009 (agent
    run logging).

Current state - Phase 2 (Supabase):

- Remote project `gokogcspheruupuiipjl` (org "ENDRA AI", `main`
  branch), created by Ender on 2026-09-14.
- Supabase CLI installed as a root devDependency (`npm i -D supabase`,
  not a system-wide install) - run via `npx supabase <command>`.
- CLI is logged in (personal access token, named "endra-cli") and
  linked to the remote project (`supabase/.temp/project-ref`, gitignored).
  The DB password was used once for `supabase link -p ...` and is not
  stored anywhere in the repo.
- `supabase/migrations/20260914180509_init_schema.sql` — first
  migration, applied to the remote database (`supabase db push`,
  verified with `supabase migration list`): `users`, `conversations`,
  `messages` tables, RLS enabled on all three with **no policies**
  (meaning the anon/publishable key gets zero access; only the secret
  key, which Core uses, bypasses RLS).
- `apps/core/src/db/supabase-client.ts` — `getSupabaseClient()`, a
  lazy singleton reading `SUPABASE_URL` / `SUPABASE_SECRET_KEY` from
  env. Verified with a real query against the live database (empty
  `users` table, no error).
- `.env` has real `SUPABASE_URL` and `SUPABASE_SECRET_KEY` values.

Next steps (pick based on what's more valuable - both are reasonable):

1. **CORE-003/004 first, then MEMORY-003**: give the LLM call something
   real to work with (an actual user + conversation row) before wiring
   `message-service.ts` up for real. Probably the more coherent order.
2. **Keep building Phase 2 schema/persistence (MEMORY-003+)** now while
   Supabase context is fresh, and circle back to CORE-003/004 after.

Either way, still true from before:
Don't wire a real LLM call into `/api/v1/message` without at least
basic agent run logging (CORE-009) first - CLAUDE.md section 25.

Important:

- Don't design the rest of the Phase 2 schema (semantic memory,
  embeddings, projects, tasks, tool_runs, agent_runs, approvals,
  scheduled_jobs) all at once - add tables via new migrations only when
  the feature that needs them (MEMORY-004 onward) is actually being
  built.
- The Supabase CLI's personal access token is stored in the CLI's own
  local config (outside this repo), not in `.env` - if the token
  expires (Ender set it to expire 2026 or 2027-06-18, needs
  confirming which year) a new one will need to be generated the same
  way.
- OpenAI is also planned for voice (Phase 7) and image generation
  tooling later - not started, no task ID yet.
