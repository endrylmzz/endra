# NEXT ACTION

Continue task:
None in progress. Tool-calling is live-wired and tested locally against
real OpenAI/Supabase - **not yet deployed**. Trigger a RepoCloud rebuild
when ready, then verify once via Telegram before considering this
fully done in production.

Goal:
Get the tool-calling wiring actually running on the VPS, verify once
via real Telegram messages, then decide what's next.

## Current state - TOOLARCH-008 (tool-calling wired into live chat)

- `packages/agent-contracts/src/llm.ts` - `LLMMessage.role` now includes
  `"tool"`, plus `toolCallId`/`toolCalls` fields; `LLMGenerateRequest`
  takes optional `tools`; `LLMGenerateResponse` returns optional
  `toolCalls`. `AnthropicProvider` (dormant) updated just enough to keep
  compiling - it drops `"tool"` role messages rather than mis-sending
  them, since it was never built to support tool-calling.
- `apps/core/src/llm/openai-provider.ts` - maps to/from OpenAI's
  function-calling shape. **Real bug found and fixed**: `gpt-5.6`
  rejects `tools` together with its default `reasoning_effort` on
  `/v1/chat/completions` - now sends `reasoning_effort: "none"`
  whenever tools are present.
- `apps/core/src/tools/default-registry.ts` - the actual registry used
  in production: `get_current_time`, `calculator`, `notes`. Nothing
  from MCP is registered here yet - the MCP proof server
  (`@modelcontextprotocol/server-everything`) was only ever a
  standalone test, not wired into live chat.
- `apps/core/src/tools/confirmation-intent.ts` - simple keyword-based
  yes/no detection for responding to a pending approval in natural
  chat (no extra LLM call just to classify intent; "unclear" is the
  safe default - never silently approves).
- `apps/core/src/tools/approvals.ts` - added `findPendingApproval()`
  (most recent pending, unexpired approval for a conversation).
- `apps/core/src/services/message-service.ts` - the actual pipeline
  now: (1) if a pending approval exists for this conversation, treat
  the message as approve/reject/unrelated; (2) otherwise, call the LLM
  with tools, loop on tool calls (max 4 iterations) until a final
  answer or a tool needs confirmation. **Confirmation prompts and
  wrap-up replies are phrased by the LLM itself** (one extra text-only
  `generate()` call, tools omitted) rather than canned strings - this
  keeps ENDRA's voice consistent, and does NOT weaken the safety
  guarantee: execution still only ever happens via
  `ToolRouter.confirm()` with the exact arguments captured at approval
  time, regardless of how anything is phrased.
- Verified live, end to end, twice (before and after the UX polish
  pass): time question -> real tool result; math question -> real
  tool result; note request -> natural confirmation question; "evet" ->
  note actually saved in Supabase, natural confirmation reply; second
  note request + "hayır" -> note correctly NOT saved, natural
  cancellation reply.
- 116 tests total, all passing (7 new/changed in `message-service.test.ts`,
  plus `confirmation-intent.test.ts`, `openai-provider` tool-calling
  tests, `approvals.findPendingApproval` tests).

## Not deployed yet

This whole change is sitting on `main`, tested locally, not yet on the
VPS. To go live: RepoCloud dashboard -> `endra-core` project -> "Resume
Chat" -> ask the agent to pull latest from `main`, rebuild, and restart
both services. Then send a real Telegram message that should trigger a
tool (e.g. ask what time it is, or ask it to save a note) to confirm it
works in production, not just locally.

## Other open items (not blocking)

- `MEMORY-008` (project memory) - likely just documenting that
  `type: "project"` in `memories` already covers this.
- Real external tools (weather, web search, calendar, Gmail - Phase 5)
  each need their own API key/OAuth - ask when building that specific
  one, and remember to pass explicit risk-level `overrides` for any
  MCP-sourced tool that mutates state (see `mcp-client.ts`'s warning -
  MCP has no risk metadata of its own).
- Multiple tool calls in one turn where one requires confirmation:
  currently the other calls' results are computed but not surfaced to
  the user in that turn (a deliberate v1 simplification - rare in
  practice with today's 3 tools).

Important:
Keep the pattern: build standalone -> unit test with fakes -> verify
with a real end-to-end call -> only then treat as done. This session
caught two real bugs this way already just in this task (the
`reasoning_effort`/tools conflict, and the robotic English-leaking
confirmation text before the UX pass).
