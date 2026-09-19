# NEXT ACTION

Continue task:
None in progress. **Six proactive/ambient features are built, tested,
and live-verified but NOT yet deployed to the VPS**: user preferences
activation, decision journal, memory hygiene, morning digest, an
LLM-filtered ambient Gmail/Calendar watcher, and proactive memory
connections (`MEMORY-008`). Full detail in `docs/DEVLOG.md`
(2026-09-19 (4)). These came from open-ended research Ender explicitly
invited, not the original roadmap - all of Phases 1-7 were already
done before this batch.

Goal:
1. **Deploy this batch** - same shape as most earlier deploys this
   session (git pull, rebuild, restart both services, check
   `/health`), no new secrets needed this time (unlike the
   Calendar/Gmail batch). Two new migrations already pushed live via
   `supabase db push` (`20260919120000_decisions.sql`,
   `20260919150000_find_related_memories.sql`) - don't re-push, just
   confirm `supabase migration list` still shows both in sync if
   double-checking.
2. After deploy, verify for real over Telegram rather than trusting
   the pre-deploy live checks alone: try `set_preference`-style
   conversational settings, log then resolve a decision, and (since
   the others are time/event-triggered, not requestable on demand)
   just confirm the scheduler tick doesn't error in production logs
   for a few cycles.
3. Only after that: Phase 8 (Web/PWA) and Phase 9 (Desktop) remain on
   the roadmap, both explicitly out of scope per CLAUDE.md section 14
   until Ender explicitly asks. Otherwise ask him directly what's
   next - the natural backlog is exhausted again.

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
