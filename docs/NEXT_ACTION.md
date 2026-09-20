# NEXT ACTION

Continue task:
None in progress. **Everything is deployed and confirmed working in
production** as of 2026-09-19: the six proactive/ambient features
(user preferences activation, decision journal, memory hygiene,
morning digest, an LLM-filtered ambient Gmail/Calendar watcher,
proactive memory connections `MEMORY-008`) plus a `proactive_runs`
observability pass Ender asked for before deploying. Ender pasted the
prepared git pull/build/test/restart instruction into the RepoCloud
DevOps AI Agent chat and confirmed it went OK. Full detail in
`docs/DEVLOG.md` (2026-09-19 (4) and (5)). These came from open-ended
research Ender explicitly invited, not the original roadmap - all of
Phases 1-7 were already done before this batch, so nothing in
`docs/TASKS.yaml` changed.

Goal:
There is no more "obvious next roadmap item" - Phase 8 (Web/PWA) and
Phase 9 (Desktop) remain, both explicitly out of scope per CLAUDE.md
section 14 until Ender explicitly asks. Real-world confirmation that
the new proactive behaviors actually fire in production is already
in: Ender confirmed the morning digest arrived for real on 2026-09-20,
no issues noticed. Next session should just ask Ender directly what he
wants next rather than assuming - the natural backlog is exhausted
again.

## Open items (not blocking)

- **`TELEGRAM-002` (n8n Telegram trigger) - explicitly skipped**, not
  abandoned. Ender has a working n8n instance
  (`https://pmo2u6ap.rpcld.co`, shared with unrelated "Akıllı Esnaf
  Kartı"/"Bahiscim" projects; API key saved in `.env` as
  `N8N_BASE_URL`/`N8N_API_KEY`). Building the actual workflow surfaced
  three real blockers: Core isn't reachable from n8n (separate
  container, and `endra-core`'s firewall was believed SSH-only per
  ADR-006 - though the RepoCloud dashboard also shows a default public
  domain, `vps-3737633d.vps.rcld.dev`, worth re-checking before
  assuming SSH-only still holds); Core's `/api/v1/message` has no
  auth; and activating an n8n Telegram Trigger would steal the
  webhook from the currently-polling `apps/telegram-adapter`,
  breaking the live bot's voice/photo/image-gen support (which
  doesn't exist in n8n form). Revisit only if Ender brings it up.
- Reminder delivery is retried (up to 3x) but not infinitely - a
  reminder can still end up `failed` in `scheduled_jobs` if Telegram
  push stays down longer than that. No user-facing way to see failed
  reminders yet (not asked for).
- No recurrence support for price/weather alerts (they're one-shot by
  design - `PROACTIVE-002`'s recurrence field only applies to
  `scheduled_jobs`/reminders).

Important - keep the pattern:
Build standalone -> unit test with fakes -> verify with a real
end-to-end call against the actual external API/DB -> only then treat
as done. This session's live checks caught multiple real bugs no mock
would have (the `gpt-5.6`/`reasoning_effort` conflict, a mangled
non-ASCII email Subject header needing RFC 2047 encoding, and others -
see `docs/DEVLOG.md` for the full history). Don't skip the live-check
step even when a task looks routine.

For full technical detail on any past milestone, see `docs/DEVLOG.md`
(newest entries first) and `docs/decisions/ADR-*.md` for architecture
decisions.
