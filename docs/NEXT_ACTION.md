# NEXT ACTION

Continue task:
CORE-001

Goal:
Create the ENDRA Core API skeleton with a single endpoint,
`POST /api/v1/message`, that ENDRA Core will use as its channel-agnostic
entry point (Telegram, web, voice, and desktop will all call this same
endpoint in later phases).

Current state:
Phase 0 (Foundation) is complete. Repository structure, TypeScript
workspaces (npm workspaces: `apps/core`, `packages/shared`,
`packages/agent-contracts`, `packages/tool-sdk`), lint/format, Vitest, the
documentation system, ADRs, and the status/next/doctor scripts are all in
place and passing (`npm run doctor`).

`apps/core/src/index.ts` currently only exports a placeholder
`getCoreVersion()` — no HTTP server exists yet.

Next steps:

1. Pick and add a minimal HTTP framework to `apps/core` (Fastify is a
   reasonable default: small, TypeScript-friendly, good schema support).
2. Implement `POST /api/v1/message` per the request shape in `CLAUDE.md`
   section 14 (`channel`, `userId`, `conversationId`, `message`).
3. Implement `GET /health` (CORE-010 can be done alongside this).
4. Write request/response schema types in `packages/agent-contracts`
   (this becomes CORE-002).
5. Add tests for the new endpoint(s).
6. Update `docs/TASKS.yaml` (mark CORE-001 in_progress → done) and this
   file when the task is complete.

Important:
Do not start Telegram, Supabase memory, or real tool integrations yet —
those are Phase 2+ per `docs/TASKS.yaml`. Keep Core channel-agnostic from
the start; no Telegram-specific code belongs in `apps/core`.
