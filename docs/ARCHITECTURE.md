# ENDRA Architecture

ENDRA is Ender's personal AI alter ego - a digital second brain, not a
chatbot. See root `CLAUDE.md` for the full concept and working rules; this
document covers the technical shape.

## High-level diagram

```text
Telegram ─────┐
Web / PWA ────┤
Voice ────────┤
Desktop ──────┘
       │
       ▼
   ENDRA Gateway
       │
       ▼
    ENDRA Core
       │
 ┌─────┼──────────────┐
 │     │              │
 ▼     ▼              ▼
Memory LLM         Tool Router
 │                    │
 ▼                    ▼
Supabase         n8n / APIs
                      │
          ┌───────────┼────────────┐
          ▼           ▼            ▼
        Gmail      Calendar       Web
          │           │            │
          └───────────┼────────────┘
                      ▼
                 Notifications

Later:

ENDRA Core → Desktop Companion → Local Computer
```

## Components

- **n8n** - orchestration / nervous system. Runs external integrations,
  scheduled jobs, and notification delivery. See `n8n/README.md`.
- **ENDRA Core** (`apps/core`) - the central intelligence layer. Channel
  agnostic: any interface (Telegram, web, voice, desktop) talks to Core
  through the same request shape. Owns identity resolution, conversation
  context, memory retrieval, LLM calls, tool routing, and response
  formatting. See ADR-004.
- **Memory** (Supabase/Postgres) - long-term memory: user profile,
  semantic/episodic/project/decision/task memory. See ADR-002 and the
  Memory Architecture section of `CLAUDE.md`.
- **LLM providers** - abstracted behind an `LLMProvider` interface so Core
  is not locked to one vendor. OpenAI and Anthropic are both usable.
- **Tool Router / Tool Registry** - standardized `EndraTool` contract with
  risk levels (read/write/critical) and a confirmation system for
  irreversible actions.
- **Channels** - Telegram first (ADR-003), then web/PWA, voice, and a
  desktop companion. None of them may contain their own agent logic; they
  are thin clients over ENDRA Core.

## Repository layout

```text
endra/
├── apps/
│   ├── core/                 ENDRA Core service
│   ├── telegram-adapter/     Telegram channel adapter (temporary, see ADR-005)
│   └── web/                  reserved for Phase 8
├── packages/
│   ├── shared/                shared types/utilities
│   ├── agent-contracts/       LLMProvider, EndraTool, message envelope types
│   └── tool-sdk/              helpers for building EndraTool implementations
├── n8n/                        exported workflow JSON (source of truth)
├── supabase/                   migrations + seed data
├── config/persona/             ENDRA's persona config (not hardcoded in code)
├── docs/                       project management docs (this file, status, tasks, ADRs)
└── scripts/                    status / next / doctor CLI scripts
```

## Design principles

- Build for the next logical step, not every hypothetical future.
- No feature beyond what the current phase requires (see `docs/TASKS.yaml`).
- No channel-specific logic leaks into Core.
- Every write/critical tool action requires a system-level confirmation
  step - the LLM cannot re-issue different parameters after approval.
- Accepted ADRs are not silently overturned; a change to an accepted
  decision requires a new ADR.
