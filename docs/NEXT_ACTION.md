# NEXT ACTION

Continue task:
Phase 3 (Tool Architecture) - `TOOLARCH-001` onward. Ender approved
building this around MCP (Model Context Protocol) rather than a fully
bespoke system, after researching current (2026) agent architecture
practice.

Goal:
Give ENDRA the ability to actually do things (not just talk), starting
with the foundation: a tool contract, registry, router, risk/permission
levels, confirmation flow for risky actions, and run logging - then
prove it works against a real MCP server before calling it done.

## Research findings this session (informing both Phase 2 and Phase 3)

- Memory: multi-signal fusion (semantic + keyword + importance +
  recency) beats vector-similarity-alone retrieval - already
  implemented (MEMORY-006). "ADD-only" extraction (treat both user
  statements and assistant confirmations as memory candidates) - also
  implemented (MEMORY-007).
- Tools: MCP (Anthropic-originated, now also officially supported by
  OpenAI's Agents SDK) standardizes tool discovery/execution so tools
  aren't hand-built one by one. Confirmed: **MCP itself has no
  standard authorization/confirmation layer at the tool-call boundary**
  - that part is still ENDRA-specific work, not something MCP gives
    for free. This matches CLAUDE.md's original section 20 design
    (`pending_action`/`approval_id`/`expires_at`) - the plan doesn't
    change, just how tools are sourced/invoked does.
- Decision: adopt MCP as the tool-calling layer for Phase 3, but keep
  building ENDRA's own permission/confirmation/audit layer on top,
  since that's the part with no existing standard.

## Current state - Phase 2 (Memory), now substantially deeper

- `apps/core/src/memory/preferences.ts` - `getPreference`/`setPreference`,
  backed by a new `preferences` table (unique on `user_id, key`).
- `apps/core/src/memory/embeddings.ts` - `embedText()`, OpenAI
  `text-embedding-3-small`.
- `apps/core/src/memory/semantic-memory.ts` - `saveMemory`,
  `searchMemories` (fused ranking via the `search_memories` Postgres
  function), `findSimilarMemory` (pure cosine similarity, for dedup).
- `apps/core/src/memory/promotion.ts` - `extractMemoryCandidates`
  (one LLM call, JSON-parsed, empty array on any parse failure - never
  throws over a formatting quirk), `promoteMemories` (dedup then
  save).
- New migrations: `memories` (+ pgvector, + generated `tsvector`
  column for keyword search), `preferences`, `search_memories()` and
  `find_similar_memory()` SQL functions.
- `message-service.ts` now: searches memories before calling the LLM
  (appended to the system prompt if any are found), and fires off
  extraction+promotion in the background after replying (never
  awaited - a promotion failure is logged to `console.error` and
  otherwise invisible to the user).
- Verified live (real OpenAI + Supabase): a two-turn conversation where
  a stated preference ("favori rengim mavi") was promoted to long-term
  memory and correctly surfaced in a later, unrelated-topic turn.
- **Not done, not started**: `MEMORY-008` (project memory - arguably
  now just a `type: "project"` memory, may not need separate work),
  entity-aware relevance boosting (research mentioned this as a further
  refinement beyond the 4-signal fusion already implemented - skipped
  for now, real complexity/cost tradeoff, revisit if retrieval quality
  turns out to need it).

## Phase 3 (Tools) - plan

1. `TOOLARCH-001` `EndraTool` contract in `packages/agent-contracts`
   (name, description, category, riskLevel, requiresConfirmation,
   inputSchema, `execute()`) - matches CLAUDE.md section 18 closely.
2. `TOOLARCH-002`/`003` Tool Registry + Router in `apps/core/src/tools/`.
3. `TOOLARCH-004`/`005` Risk levels (read/write/critical) +
   confirmation state, backed by a new `approvals` table
   (`pending_action`/`approval_id`/`expires_at`, per CLAUDE.md
   section 20) - critical/requires-confirmation tools never execute
   immediately, they create a pending approval instead.
4. `TOOLARCH-006` Tool run logging - new `tool_runs` table, same
   never-throws-on-its-own-failure pattern as `agent_runs`.
5. `TOOLARCH-007` First test tools: `get_current_time`, `calculator`
   (both `read`, no confirmation), `notes` (`write`, Supabase-backed,
   new `notes` table).
6. MCP proof: connect to `@modelcontextprotocol/server-everything`
   (Anthropic's official reference/test server - runs locally via
   stdio, no account/API key needed) using `@modelcontextprotocol/sdk`,
   list its tools, wrap them as `EndraTool` instances via the registry,
   and execute one for real.
7. **Not in this pass**: actually wiring tool-calling into
   `message-service.ts`'s live LLM loop (i.e. OpenAI deciding to call
   a tool mid-conversation, in production). Build and verify the
   architecture standalone first, the same way LLM providers and
   memory were built before being wired in - ask before flipping that
   on in production, since it changes live chat behavior and adds a
   tool-call round-trip to every message.

Important:

- Real external tools (weather, web search, calendar, Gmail - Phase 5)
  will likely need their own API keys/OAuth once we get there - ask
  Ender for the specific credential only when that specific tool is
  being built, not preemptively.
- Keep verifying with real end-to-end tests (not just mocks) before
  marking anything done, per this session's established practice.
