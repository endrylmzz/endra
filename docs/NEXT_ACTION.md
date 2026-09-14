# NEXT ACTION

Continue task:
None in progress. Ender is actively using the Telegram bot right now -
next step is his call (deeper memory, tools, or sort out deployment).

Goal:
Phase 1 (Core) is done. Phase 4 (Telegram) is done except the eventual
n8n workflow (`TELEGRAM-002`, deliberately deferred - see ADR-005).
Ender can talk to ENDRA from his phone today.

Current state - Telegram (`apps/telegram-adapter`):

- Bot: `@endraaibot` (name "E.N.D.R.A"). Token was revoked and
  regenerated once already this session (the original token given
  turned out to be invalid/revoked) - current one is in `.env`.
- `ENDRA_ALLOWED_TELEGRAM_USERS=1028764118` - Ender's Telegram user id,
  captured from an "unauthorized" log line the first time he messaged
  the bot before the allowlist was set. Only this id can reach ENDRA
  Core via Telegram.
- Long-polling adapter, no webhook/public URL needed. Verified live:
  Ender sent messages through Telegram, got real ENDRA replies back.
- **Only runs while manually started.** Both `apps/core` and
  `apps/telegram-adapter` were started by hand this session
  (`node --env-file=.env dist/index.js` in each) and are currently
  still running so Ender can keep chatting. If either process is
  killed (or the machine restarts), the bot stops responding until
  both are started again - there is no supervisor/service manager yet.
- `TELEGRAM-002` (n8n Telegram trigger workflow) is intentionally not
  done - this whole adapter is a temporary bridge per ADR-005.

## Real open question: deployment / 24-7

Nothing is deployed anywhere yet. Ender needs to check his RepoCloud
dashboard for whether it can host a custom Node service (not just
marketplace apps like n8n) - see ADR-005's context section. Once that's
known:

- **If RepoCloud can host custom apps:** deploy `apps/core` (and either
  keep `apps/telegram-adapter` running there too, or migrate to a real
  n8n workflow if n8n is also set up there) - this fulfills the
  original architecture (ADR-001) for real.
- **If not:** `apps/core` needs a different host (Railway, Fly.io,
  Render, etc.) - a decision to make when it comes up, not before.

Don't start on deployment work speculatively - wait for Ender to check
RepoCloud and report back what's actually possible there.

## Other real options (pick based on priority, same as before)

- **Phase 2 (Memory)**: `MEMORY-004` (preferences), `MEMORY-005+`
  (semantic memory/embeddings/retrieval/promotion).
- **Phase 3 (Tools)**: `EndraTool` contract, registry, router,
  permissions, confirmation system - needed before ENDRA can do
  anything beyond talk.

Important:

- Whichever direction, keep verifying with real end-to-end smoke tests
  before marking things done - this has caught two real problems this
  session already (the Fastify `removeAdditional` default, and the
  revoked Telegram token).
- If a new Telegram feature needs inline buttons (e.g. confirmation
  prompts for risky tool actions, CLAUDE.md section 20), that's not
  built yet - the adapter only handles plain text messages/replies
  right now.
