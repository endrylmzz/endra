# ENDRA PROJECT STATUS

Current Phase:
**Phase 5 is fully done.** Phases 1, 2, 3, 4, 6, 7 all done too. All
that's left on the roadmap is Phase 8 (Web/PWA) and Phase 9 (Desktop) -
both explicitly out of scope for now per CLAUDE.md section 14 ("İlk
sürümlerde yapılmayacaklar").

Overall Progress:
85% (see `npm run status`, computed from `docs/TASKS.yaml`)

Last Completed:
**`deep_research` tool + a systemic LLM-provider bug fix.** Breaks a
broad topic into up to 4 sub-questions, researches each, synthesizes
one report - genuinely multi-step, unlike one-shot `web_search`.
Building it surfaced a real bug affecting every existing LLM call, not
just this tool: `gpt-5.6`'s `reasoning_effort` was only disabled when
tools were present, so a plain call with long input could spend its
entire token budget on hidden reasoning and return empty content
(reproduced live: `finish_reason: "length"`, 0 visible chars). Fixed by
always disabling `reasoning_effort` and adding an optional `maxTokens`
override for long-form outputs; re-verified live with a complete
14,912-character report. 336/336 tests. Also ran an external research
round on modern agent patterns per Ender's request - 6 ideas proposed,
2 accepted as later work (ambient-watch silence bias, memory
consolidation), 2 explicitly rejected (generalized orchestration
framework, confidence calibration) as drifting toward the roadmap's
banned territory or unnecessary complexity. Full detail in
`docs/DEVLOG.md` (2026-09-20 (2)). Not yet deployed to the VPS.

Before that: **structured entity tracking** (`MEMORY-009`) - people/
places/projects/organizations are extracted alongside each memory
candidate (no extra LLM call) and linked via new `entities`/
`memory_entities` tables, with `list_entities`/`recall_about` tools to
query them ("what have we discussed about X"). No explicit
relationship type between entities - co-occurrence in a memory is
enough. Found and fixed a real bug via live testing: Turkish "İ" needs
`toLocaleLowerCase("tr")`, not the JS default, or "İzmir" and "izmir"
resolve to two different entities. Migration
`20260920090000_entities.sql` pushed live. Full detail in
`docs/DEVLOG.md` (2026-09-20). Also not yet deployed - will go out
together with the deep_research batch above.

Before that: **six proactive/ambient features**, from open-ended research Ender
explicitly invited after confirming Calendar/Gmail worked live (none
map to a pre-existing `TASKS.yaml` id):

- User preferences activated (`set_preference`/`list_preferences`/
  `delete_preference`), answering Ender's question about whether he
  can change settings conversationally over Telegram - yes.
- Decision journal (`log_decision`/`list_decisions`/`resolve_decision`,
  new `decisions` table, open decisions injected into every system
  prompt).
- Memory hygiene (weekly stale-memory digest + `list_memories`/
  `delete_memory`).
- Morning digest (daily calendar + reminders + email + open decisions,
  skips sending when empty).
- Ambient Gmail/Calendar watcher - checks every 15 min, LLM-filtered
  (Ender's explicit choice over a cheaper always-notify design) so it
  only pings for things actually worth interrupting about.
- Proactive memory connections (`MEMORY-008`) - a new
  `find_related_memories` SQL function plus an LLM judge that
  occasionally volunteers a genuine connection or contradiction between
  a new memory and older ones, queued one-shot into the next system
  prompt.

All six built standalone, unit-tested with fakes, then live-verified
against real Gmail/Calendar/LLM/DB (never by sweeping real users -
only isolated test users or scoped helpers). Followed by a hardening
pass Ender asked for before deploying: a `proactive_runs` log table so
a failing scheduled check is visible in Supabase instead of only in
VPS console logs. 307/307 tests, clean build, clean lint, clean
format. Three new migrations pushed live via `supabase db push`. Full
detail in `docs/DEVLOG.md` (2026-09-19 (4) and (5)).

Before that: Calendar and Gmail with real Google OAuth
(`TOOLS-003`/`TOOLS-004`, `ADR-008`) - see `docs/DEVLOG.md` for detail.

Currently Working:
(none)

Blocked:
None, but **two batches are not yet deployed to the VPS**: structured
entity tracking (`MEMORY-009`) and `deep_research` + the LLM-provider
reasoning-effort fix. Both built, tested, and live-verified against
the real DB/LLM/APIs; no rebuild/restart has happened yet; no new
secrets needed for either. The six-feature proactive batch plus
observability hardening from 2026-09-19 are already deployed and
confirmed (digest arrived for real in production, no issues).

Next:
Deploy both undeployed batches together (plain git pull + rebuild +
restart) when Ender is ready. After that, every tool-, proactivity-,
and memory-shaped item from the original roadmap and this session's
research is done. Only Phase 8 (Web/PWA) and Phase 9 (Desktop) remain,
both explicitly out of scope per CLAUDE.md section 14 until Ender
explicitly asks - otherwise ask him directly what's next. See
`docs/NEXT_ACTION.md`.

Last Updated:
2026-09-20
