# ENDRA PROJECT STATUS

Current Phase:
**Phase 5 is fully done.** Phases 1, 2, 3, 4, 6, 7 all done too. All
that's left on the roadmap is Phase 8 (Web/PWA) and Phase 9 (Desktop) -
both explicitly out of scope for now per CLAUDE.md section 14 ("İlk
sürümlerde yapılmayacaklar").

Overall Progress:
85% (see `npm run status`, computed from `docs/TASKS.yaml`)

Last Completed:
**Six proactive/ambient features**, from open-ended research Ender
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
None. **This session's six-feature batch plus the observability
hardening are deployed and confirmed working in production** - Ender
confirmed the VPS deploy went OK on 2026-09-19 after pasting the
prepared git pull/build/test/restart instruction into the RepoCloud
DevOps AI Agent chat.

Next:
Every tool- and proactivity-shaped item from both the original roadmap
and this session's research is now done. Only Phase 8 (Web/PWA) and
Phase 9 (Desktop) remain, both explicitly out of scope per CLAUDE.md
section 14 until Ender explicitly asks. Worth a light real-world check
when convenient (a digest actually arriving, an ambient notification,
a volunteered memory connection) rather than only trusting the
pre-deploy live checks - but otherwise, ask Ender directly what's
next; the backlog is exhausted again. See `docs/NEXT_ACTION.md`.

Last Updated:
2026-09-19
