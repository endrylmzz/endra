# NEXT ACTION

Continue task:
None in progress. The six proactive/ambient features (user preferences
activation, decision journal, memory hygiene, morning digest, an
LLM-filtered ambient Gmail/Calendar watcher, proactive memory
connections `MEMORY-008`) plus `proactive_runs` observability are
**deployed and confirmed working in production** as of 2026-09-19 -
Ender confirmed both the VPS deploy and, separately, that the morning
digest arrived for real with no issues.

On 2026-09-20, Ender asked for direction suggestions; picked
**structured entity tracking (`MEMORY-009`)** - people/places/projects/
organizations extracted alongside each memory candidate and linked via
new `entities`/`memory_entities` tables, queryable with `list_entities`/
`recall_about`. Built, tested, live-verified (including a real bug fix:
Turkish "İ" needs `toLocaleLowerCase("tr")` for entity-name matching to
work correctly). **Not yet deployed to the VPS.** Full detail in
`docs/DEVLOG.md` (2026-09-20). None of this batch maps to a
pre-existing `TASKS.yaml` id - open-ended research/direction picks, not
the original roadmap.

Goal:
1. **Deploy the entity-tracking batch** - same shape as every earlier
   deploy this session (git pull, rebuild, restart both services,
   check `/health`). No new secrets needed. Migration
   `20260920090000_entities.sql` is already pushed live via
   `supabase db push` - don't re-push.
2. After that, there is no more "obvious next roadmap item" - Phase 8
   (Web/PWA) and Phase 9 (Desktop) remain, both explicitly out of
   scope per CLAUDE.md section 14 until Ender explicitly asks.
   Otherwise ask him directly what he wants next.

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
