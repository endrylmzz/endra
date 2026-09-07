# ENDRA

Ender's personal AI alter ego — a digital second brain, not a chatbot.

ENDRA remembers context and decisions across conversations and channels,
can use tools, tracks tasks, and (eventually) acts proactively. It starts
on Telegram and is designed to expand to web/PWA, voice, and a desktop
companion without any channel owning core logic.

See **`CLAUDE.md`** for the full concept, architecture, and working rules
this repository follows. See **`docs/ARCHITECTURE.md`** for the technical
architecture, **`docs/TASKS.yaml`** for the roadmap, and
**`docs/PROJECT_STATUS.md`** / **`docs/NEXT_ACTION.md`** for current state.

## Getting started

```bash
npm install
npm test
npm run status
npm run next
npm run doctor
```

## Project structure

```text
apps/core/            ENDRA Core (channel-agnostic API)
apps/web/              reserved for a future web/PWA client
packages/shared/       shared types and utilities
packages/agent-contracts/  LLMProvider, EndraTool, message contracts
packages/tool-sdk/     helpers for building EndraTool implementations
n8n/                    orchestration workflows (exported JSON)
supabase/               database migrations and seed data
config/persona/         ENDRA's persona configuration
docs/                   project management: status, tasks, ADRs, architecture
scripts/                status / next / doctor CLI scripts
```

## Scripts

- `npm run status` — current phase, progress, active/next task.
- `npm run next` — active task and the full content of `docs/NEXT_ACTION.md`.
- `npm run doctor` — checks the dev environment is healthy (never prints secrets).
- `npm test` — run the test suite (Vitest).
- `npm run lint` / `npm run format` — lint / format the codebase.
