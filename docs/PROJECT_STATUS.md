# ENDRA PROJECT STATUS

Current Phase:
Phase 3 (Tools) fully done and deployed. Phases 1, 2, 4 done. Two
Phase 7 (Voice) tasks and several Phase 5/6 tasks (reminders,
scheduled delivery) done early, out of order, as real needs came up
rather than waiting on the full phase sequence.

Overall Progress:
73% (see `npm run status`, computed from `docs/TASKS.yaml`)

Last Completed:
**ENDRA can now remind Ender of things on its own.** New
`set_reminder` / `list_reminders` / `cancel_reminder` tools
(`TOOLS-006`), backed by a new `scheduled_jobs` table and an in-process
scheduler in `apps/core` (`PROACTIVE-001`) that polls for due reminders
every 30s and pushes them out (`PROACTIVE-004`). No new API key needed

- built entirely on Supabase and Telegram, already configured.

New architecture piece (`ADR-007`): Core stays channel-agnostic - it
doesn't call Telegram's Bot API itself. Instead, `apps/telegram-adapter`
now also runs a tiny localhost-only `POST /push` endpoint, guarded by a
shared secret (`ENDRA_INTERNAL_SECRET`, finally put to real use). Core's
scheduler calls that endpoint to deliver a reminder; no firewall change,
no public exposure - both services already share the same VPS.

Verified live end-to-end against the real Supabase DB (not mocks): set
a reminder, listed it, ran the actual due-reminder join query, marked
it delivered, and cancelled a second one - all through real inserts/
updates/deletes (cleaned up after). Also verified a real localhost
HTTP round-trip between Core's delivery call and the adapter's push
server, including a rejected wrong-secret request. 155/155 tests,
clean build, clean lint, clean format.

Along the way, also closed out three roadmap items that turned out to
already be done or not worth doing right now: `MEMORY-008` (project
memory already worked, just unmarked), `TOOLS-005`/`TOOLS-007` (notes
and crypto tools already shipped under `TOOLARCH-009`), and
`TELEGRAM-002` (n8n Telegram trigger - explored, real blockers found,
explicitly skipped for now; see `docs/NEXT_ACTION.md`).

Currently Working:
(none)

Blocked:
None. **Not yet deployed** - this is a real production-behavior change
(new scheduler running in Core, new endpoint on the adapter). Needs a
RepoCloud rebuild + restart of both services, plus setting
`ENDRA_INTERNAL_SECRET`/`TELEGRAM_PUSH_URL`/`TELEGRAM_PUSH_PORT` in
each service's production environment (see `docs/NEXT_ACTION.md`).

Next:
Verify the reminder flow once live via a real Telegram message ("5
dakika sonra şunu hatırlat"), then decide what's next - a key-requiring
tool (weather, web search, calendar, Gmail - `TOOLS-001` suggested), or
something else.

Last Updated:
2026-09-15
