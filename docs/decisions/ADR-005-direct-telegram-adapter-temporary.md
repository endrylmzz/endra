# ADR-005 Direct Telegram Adapter, Bypassing n8n (Temporary)

Status: Accepted

Context:
ADR-001 established n8n as the integration layer that should own
Telegram inbound/outbound handling. As of this decision, RepoCloud's
n8n instance has not been connected to or verified in this project -
no `N8N_BASE_URL` is configured, and it's unclear whether RepoCloud
can also host a custom service like ENDRA Core (RepoCloud is an
open-source app marketplace/PaaS - n8n is one of its marketplace apps;
whether/how to deploy a custom Node service there is still an open
question for Ender to check in the RepoCloud dashboard). Setting up
n8n properly would block getting a working, usable Telegram bot today.

Decision:
Implement Telegram as a small standalone adapter, `apps/telegram-adapter`,
that long-polls the Telegram Bot API directly and calls ENDRA Core's
existing `POST /api/v1/message` endpoint over HTTP - the same contract
n8n would eventually use. This bypasses n8n for now, but does not
touch Core or change its channel-agnostic design (ADR-004 still
holds).

Reasons:

- Fastest path to Ender actually being able to talk to ENDRA from his
  phone, without waiting on RepoCloud/n8n access to be sorted out.
- Long polling needs no public URL or webhook - works from a local
  dev machine, no deployment required to test.
- Because the adapter only calls Core's already-stable HTTP contract
  (`channel`, `userId`, `conversationId`, `message`), swapping it for
  an n8n workflow later is a drop-in replacement - Core doesn't
  change, only this adapter gets retired.

Alternatives:

- Wait until RepoCloud n8n access is set up before building any
  Telegram integration. Rejected: no clear timeline, and blocks real
  usage for no benefit - ENDRA Core already works.
- Put Telegram-specific logic inside `apps/core`. Rejected: would
  violate ADR-004 (Core must stay channel-agnostic; new channels are
  thin adapters that call Core, not code living inside it).

Consequences:

- This adapter is explicitly temporary. When RepoCloud/n8n access is
  confirmed and set up, `TELEGRAM-002` (n8n Telegram trigger workflow)
  should be done for real, and this adapter's polling loop retired (or
  kept only as a local-dev convenience).
- Neither this adapter nor Core is deployed anywhere yet - the bot
  only responds while `apps/telegram-adapter` and `apps/core` are both
  running on a machine (e.g. Ender's or during a Claude Code session).
  24/7 availability requires deploying both somewhere persistent - a
  separate, not-yet-answered question (see `docs/NEXT_ACTION.md`).
- User authorization (`ENDRA_ALLOWED_TELEGRAM_USERS`) still applies
  exactly as ADR-003 required - the adapter does not change that
  security boundary, just where the check runs.
