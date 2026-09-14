# NEXT ACTION

Continue task:
None in progress. Tool architecture is built and proven standalone.
The next real decision is whether to wire it into live chat now.

Goal:
Decide: flip on tool-calling in production (`message-service.ts`), or
keep building other things first.

## Current state - Phase 3 (Tools), built and proven, not yet live

- `packages/agent-contracts/src/tool.ts` - `EndraTool`,
  `ToolExecutionContext` (had to add this - `execute(input)` alone
  can't know which user is calling, e.g. for the `notes` tool;
  CLAUDE.md's original sketch didn't have this, added it once actually
  implementing revealed the gap), `ToolRiskLevel`, `ToolResult`.
- `apps/core/src/tools/registry.ts` - `ToolRegistry` (register/get/list).
- `apps/core/src/tools/router.ts` - `ToolRouter.route()` (dispatches;
  confirmation-required tools create a pending approval instead of
  executing) and `.confirm()` (always executes with the arguments
  stored at approval time - never anything supplied later).
- `apps/core/src/tools/approvals.ts` + new `approvals` table -
  `pending`/`approved`/`rejected`/`expired`, 5-minute TTL.
- `apps/core/src/tools/tool-run-log.ts` + new `tool_runs` table - same
  never-throws-on-its-own-failure pattern as `agent_runs`.
- `apps/core/src/tools/builtin/`: `get_current_time` (read),
  `calculator` (read - has its own safe recursive-descent arithmetic
  parser, no `eval()` on LLM-influenced input), `notes` (write,
  `requiresConfirmation: true`, new `notes` table - the deliberate
  first tool to exercise the full confirmation flow).
- `apps/core/src/tools/mcp-client.ts` - `connectMcpServer()` +
  `loadMcpTools()`, wraps any MCP server's tools as `EndraTool`s.
  **Important caveat documented in the file**: MCP has no risk/
  confirmation concept, so wrapped tools default to `read`/no-
  confirmation - safe only for a reviewed server. A new real MCP
  server (Phase 5+) needs explicit `overrides` for anything that
  mutates state or costs money - never trust the default there.
- Verified live twice: (1) full router flow against real Supabase -
  read tool executes immediately, write tool creates a pending
  approval, confirming executes with the stored arguments, confirming
  the same approval twice is correctly refused, full audit trail in
  `tool_runs`; (2) real MCP server connection
  (`@modelcontextprotocol/server-everything` via stdio/npx) - listed
  its 13 real tools, called `get-sum` through the router, got the
  correct real result.
- 99 tests total now, all passing.

## The actual next decision

**Wiring tools into live chat** means: extend `OpenAIProvider` (or add
a new method) to pass tool definitions to OpenAI's function-calling API,
have `message-service.ts` loop (LLM responds -> maybe wants a tool ->
route it -> feed the result back to the LLM -> maybe another tool ->
... -> final text reply), and register `getCurrentTimeTool`,
`calculatorTool`, `createNotesTool()` (and decide whether to also
connect a real MCP server, or leave that for Phase 5) into a registry
at startup.

This is a genuine production-behavior change (every message could now
trigger 1+ tool-call round-trips, more OpenAI cost/latency, and -
crucially - the `notes` tool means ENDRA could actually write to the
database as a result of a live conversation for the first time). Don't
flip this on without confirming with Ender first, the same way the
first real OpenAI/Supabase calls were confirmed earlier this session.

## Other open items (not blocking, just tracked)

- `MEMORY-008` (project memory) - likely just documenting that
  `type: "project"` in the existing `memories` table already covers
  this; confirm rather than build something new.
- Deployment/24-7 question from earlier (RepoCloud vs elsewhere) -
  currently resolved via the RepoCloud VPS (ADR-006); nothing more to
  do unless it stops being sufficient.
- Real external tools (weather, web search, calendar, Gmail - Phase 5)
  will need their own API keys/OAuth - ask for the specific credential
  only when building that specific tool.

Important:
Every piece built this session (LLM providers, memory, tools) followed
the same shape: build standalone -> unit test with injected fakes ->
verify with a real end-to-end call -> only then wire into production,
asking first when the wiring changes live behavior meaningfully. Keep
doing that.
