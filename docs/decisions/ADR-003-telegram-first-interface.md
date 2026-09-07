# ADR-003 Telegram as the First User Interface

Status: Accepted

Context:
ENDRA needs a real, usable interface from Ender's phone and computer
before any custom UI exists. A web/PWA client is planned (Phase 8) but is
significant additional work, and voice (Phase 7) depends on having a
working text channel first.

Decision:
Telegram is ENDRA's first user-facing interface (Phase 4, before any
custom web/PWA/voice UI is built).

Reasons:

- Free, cross-platform (phone + desktop) client already installed and
  familiar to the user — zero UI development needed to get a real
  interface.
- Native support for text, voice notes, images, files, and inline
  buttons, which covers ENDRA's near-term interaction needs (including
  future confirmation prompts and voice, Phase 7).
- Bot API is simple to integrate via n8n's Telegram trigger (ADR-001).

Alternatives:

- Build a web/PWA chat UI first. Rejected for the first interface:
  meaningfully more upfront work for no functional gain over Telegram at
  this stage; still planned for Phase 8.
- Slack or Discord. Rejected: no clear advantage over Telegram for a
  single-user personal assistant, and Telegram has better first-class
  voice message support.

Consequences:

- ENDRA Core must remain channel-agnostic (ADR-004) — Telegram-specific
  parsing, authorization, and formatting live in the n8n Telegram
  workflows and/or a thin adapter, never inside Core's request handling.
- Only Telegram user IDs listed in `ENDRA_ALLOWED_TELEGRAM_USERS` may
  reach ENDRA Core (see `CLAUDE.md` section 28) — the bot is not public.
- Future channels (web, voice, desktop) must be addable without changing
  how Telegram already works.
