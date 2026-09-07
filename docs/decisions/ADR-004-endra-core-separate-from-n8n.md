# ADR-004 ENDRA Core as a Service Separate from n8n

Status: Accepted

Context:
It would be possible to implement most of ENDRA's "intelligence" directly
as n8n workflow nodes (LLM calls, memory queries, tool logic all wired up
visually). This is tempting for speed but risks locking all of ENDRA's
core logic into a single orchestration tool that is hard to unit test,
version meaningfully in git, and swap channels against.

Decision:
ENDRA Core is a standalone TypeScript service (`apps/core`), independent
of n8n and independent of any specific channel (Telegram, web, voice,
desktop). It exposes a generic endpoint, `POST /api/v1/message`, taking
`{ channel, userId, conversationId, message }`. n8n (and later, other
channels) call into Core; they do not reimplement agent logic themselves.

Reasons:

- Testability: Core logic (identity, memory retrieval, LLM calls, tool
  routing, response formatting) can be unit/integration tested like
  normal code, which is not practical for n8n workflow logic.
- Channel independence: Telegram, web, voice, and desktop must all be
  able to use the same intelligence without duplicating logic per
  channel (see `CLAUDE.md` sections 2 and 14).
- Portability: Core is not tied to n8n's hosting or execution model,
  making it easier to evolve (e.g. swap LLM providers, add model
  routing) without touching orchestration workflows.

Alternatives:

- Implement agent logic entirely inside n8n workflows. Rejected: harder
  to test, harder to version meaningfully (JSON diffs), and ties core
  intelligence to a single tool's execution model.
- Merge Core into the Telegram bot process. Rejected: would recreate the
  channel-coupling problem ADR-003 explicitly avoids.

Consequences:

- Any new channel is a thin adapter that calls `POST /api/v1/message` —
  it must not contain its own agent, memory, or persona logic.
- n8n workflows that need "ENDRA's brain" call ENDRA Core over HTTP
  rather than reimplementing logic in nodes.
- Core must be deployable and testable independently of n8n being
  available.
