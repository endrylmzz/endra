# ADR-001 n8n as Orchestrator

Status: Accepted

Context:
ENDRA needs to talk to a growing set of external services (Telegram,
Gmail, Calendar, weather/web APIs, notification channels) and run
scheduled/proactive jobs, without ENDRA Core having to own bespoke
integration code for every one of them. RepoCloud already runs n8n, which
is available today.

Decision:
n8n is ENDRA's orchestration / integration layer. It owns triggers
(Telegram inbound, schedules, webhooks), calls out to third-party APIs,
and forwards normalized requests into ENDRA Core. It is not where agent
intelligence, memory, or persona logic lives.

Reasons:

- Already running on the existing infrastructure (RepoCloud) — no new
  service to stand up.
- Visual workflow editor makes integration wiring easy to inspect and
  modify without redeploying Core.
- Good fit for scheduled/proactive triggers (Phase 6) and multi-step
  integration flows (Gmail, Calendar, notifications).

Alternatives:

- Hand-rolled integration code inside ENDRA Core for each external
  service. Rejected: couples Core to every third-party API's quirks and
  makes Core harder to reason about and test.
- A different workflow engine (Temporal, Airflow, etc.). Rejected for
  Phase 0-1: more operational overhead than needed right now, and n8n is
  already available.

Consequences:

- ENDRA Core must expose a stable, channel-agnostic API
  (`POST /api/v1/message`) that n8n calls into — n8n must never contain
  agent/persona/memory logic itself (see ADR-004).
- Workflow changes made live in n8n are not "done" until exported to
  `n8n/workflows/` in this repo (source of truth lives in git).
