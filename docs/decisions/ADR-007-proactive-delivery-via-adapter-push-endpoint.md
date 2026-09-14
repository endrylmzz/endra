# ADR-007 Proactive Delivery via a Local Adapter Push Endpoint

Status: Accepted

Context:
Every existing flow through ENDRA Core (ADR-004) is inbound: a channel
adapter calls `POST /api/v1/message`, Core replies, the adapter sends
that reply out. There was no way for Core to start a conversation
turn on its own - needed for reminders (PROACTIVE-001/TOOLS-006) and,
later, other proactive notifications (PROACTIVE-003/004). Core must
stay channel-agnostic (ADR-004): it should not know how to speak
Telegram's Bot API itself.

Decision:
Each channel adapter exposes one small local HTTP endpoint,
`POST /push` (`{ conversationId, message }`), bound to `127.0.0.1`
only. Core's scheduler (`apps/core/src/proactive/scheduler.ts`) polls
`scheduled_jobs` for due rows on an in-process interval and, for each
one, calls the matching channel's push endpoint - today, only
`deliverToTelegram()` exists, matching the only channel that exists.
The endpoint is protected by a shared secret
(`ENDRA_INTERNAL_SECRET`, sent as `X-Endra-Internal-Secret`) - the
same env var that had been reserved but unused since Phase 0.

Reasons:

- Keeps Telegram-specific code (the Bot API call itself) inside
  `apps/telegram-adapter`, not Core - consistent with ADR-004.
- No new infrastructure: Core and the adapter already run on the same
  VPS (ADR-006) and can already reach each other over localhost - no
  firewall change, no public exposure, unlike what an n8n integration
  would need (see the TELEGRAM-002 exploration in
  `docs/DEVLOG.md`, 2026-09-15).
- An in-process `setInterval` in Core needs no extra deployment step
  (no VPS cron, no second service) and fits `apps/core` already being
  a long-lived daemon under systemd.
- Generalizes cleanly: a future channel (web, desktop) implements the
  same `POST /push` contract; Core doesn't change.

Alternatives:

- Core calls Telegram's Bot API directly for proactive delivery.
  Rejected: reintroduces exactly the channel-coupling ADR-004 was
  written to avoid, for a problem the adapter-push approach solves
  just as simply.
- Route proactive delivery through n8n once it's connected. Rejected
  for now: n8n integration is on hold (TELEGRAM-002, skipped
  2026-09-15) pending unrelated blockers (Core reachability, auth,
  the Telegram webhook/polling conflict) - reminders shouldn't wait on
  that.
- An external cron job (VPS-level) hitting a Core endpoint instead of
  an in-process interval. Rejected: extra moving part (systemd timer
  or crontab entry to set up and keep in sync with deploys) for no
  benefit over a `setInterval` already running inside a process that's
  supervised and restarted by systemd anyway.

Consequences:

- `ENDRA_INTERNAL_SECRET` must be set to the same real value in both
  Core's and the Telegram adapter's environment - it was empty
  (unused) before this.
- If `apps/telegram-adapter` is ever retired in favor of an n8n
  workflow (ADR-005's eventual plan), that workflow will need its own
  way to receive a push from Core - a webhook node listening for the
  same `{ conversationId, message }` shape is the natural fit, kept
  behind the same shared secret.
- Reminder delivery is at-least-once-effort, not guaranteed: a job is
  marked `sent` only after a successful push; on failure it's marked
  `failed` and is not retried automatically (no retry/backoff logic
  yet - out of scope for this first version).
