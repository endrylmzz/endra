# NEXT ACTION

Continue task:
Wire `message-service.ts` up for real - this is the immediate next
step, already in progress in this same session.

Goal:
Every piece Core needs to give a real ENDRA reply now exists in
isolation and is tested (including against the real Supabase
database): identity resolution, message persistence, an LLM provider,
a persona, and agent run logging. None of them are connected together
yet - `POST /api/v1/message` still returns the static stub from
`services/message-service.ts`.

Current state:

- `apps/core/src/identity/resolve-identity.ts` — `resolveIdentity({channel, externalUserId, externalConversationId})`
  → `{userId, conversationId}` (internal Supabase ids), find-or-create.
- `apps/core/src/memory/messages.ts` — `saveMessage(conversationId, {role, content})`,
  `getRecentMessages(conversationId, limit)`.
- `apps/core/src/llm/openai-provider.ts` — `OpenAIProvider`, active default.
- `apps/core/src/persona/load-persona.ts` — `loadPersona()`.
- `apps/core/src/observability/agent-run-log.ts` — `logAgentRun({...})`,
  never throws (logs to `console.error` and continues on failure - a
  logging outage must not break the actual response).
- All backed by real, applied Supabase migrations (`users`,
  `conversations`, `messages`, `agent_runs`).

The wiring itself (`services/message-service.ts`, replacing the
current stub `handleMessage`):

1. `resolveIdentity({channel, externalUserId: userId, externalConversationId: conversationId})`
2. `getRecentMessages(resolvedConversationId)` for history
3. `saveMessage(resolvedConversationId, {role: "user", content: message})`
4. Call `OpenAIProvider.generate({systemPrompt: loadPersona(), messages: [...history, {role: "user", content: message}]})`,
   timing it (for `durationMs`)
5. `saveMessage(resolvedConversationId, {role: "assistant", content: reply.content})`
6. `logAgentRun({conversationId, userId, provider: "openai", model, status, durationMs, inputTokens, outputTokens, errorMessage?})` -
   on both success and failure (wrap in try/catch, log status: "error" and rethrow so the route's existing error handler still returns a proper error response)
7. Return `{message: reply.content, conversationId: <the original external one, not the internal Supabase id>}` -
   keep the response contract's `conversationId` meaning "the id you
   gave me", not leaking the internal Supabase id.

Once this works, CORE-008 (standard response format) should already be
satisfied by the existing `{success, data}` / `{success, error}`
envelope from CORE-001 - confirm that's still true rather than
re-mark it pending.

Important:

- Test this with the injected/fake clients already established for
  each piece (`OpenAIProvider`, Supabase client) - don't make the unit
  test suite hit real APIs. Do one real end-to-end manual smoke test
  (like the ones already done for OpenAI, Supabase, identity,
  messages, and agent_runs individually) to confirm the whole chain
  works together before calling this done.
- `.env` still isn't auto-loaded by any npm script (`node --env-file=.env`
  has only been used manually for smoke tests) - decide whether to
  wire that into `start`/`dev` now that Core actually needs env vars
  to function, or leave it for whenever real deployment is set up.
- Not started yet, no task ID: OpenAI for voice (Phase 7) / image
  generation tooling, wiring `.env` loading into npm scripts, Telegram
  (Phase 4, token already sits in `.env` unused).
