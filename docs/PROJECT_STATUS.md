# ENDRA PROJECT STATUS

Current Phase:
Phase 3 (Tools) fully done and deployed. Phases 1, 2, 4 done. All of
Phase 6 (Proactive) and Phase 7 (Voice) done, plus Phase 5's notes and
crypto tools - all key-free work is now essentially finished. Only
key-requiring tools (weather, web search, calendar, Gmail) remain
before Phase 5 closes out.

Overall Progress:
80% (see `npm run status`, computed from `docs/TASKS.yaml`)

Last Completed:
**Reminders can now repeat, and ENDRA can watch a price for you.**

- `PROACTIVE-002` (recurring reminders): `set_reminder` takes an
  optional `recurrenceSeconds`. On delivery, a recurring job is
  rescheduled to `due_at + interval` (not `now + interval`, so a
  delayed tick doesn't drift the schedule) instead of being closed out.
- `PROACTIVE-003` (conditional monitors): `set_reminder`'s sibling for
  a different kind of trigger - `set_price_alert` /
  `list_price_alerts` / `cancel_price_alert`, watching a CoinGecko
  price (still no API key) and firing once a target is crossed.
  Weather-based conditions wait on `TOOLS-001` (needs a key).
- `PROACTIVE-005` (dedup/cooldown): satisfied by design rather than
  with new machinery - a triggered alert's status leaves `pending`, so
  the next scheduler tick simply never re-checks or re-fires it.

Verified live against the real Supabase DB and a real CoinGecko call
(not mocks): a recurring reminder delivered once and was correctly
rescheduled to its next occurrence; a price alert set against BTC's
real live price triggered immediately and was marked `triggered`;
re-running the check confirmed it was not re-delivered. 177/177 tests,
clean build, clean lint, clean format.

Before that: text-to-speech replies (`VOICE-003`/`VOICE-004`) shipped
and were verified live against the real OpenAI API - a voice message
in now gets a voice message back, mirroring the turn's input modality.

Currently Working:
(none)

Blocked:
None. **Not yet deployed** - both this and the TTS feature from
earlier are sitting on `main`. No new secrets needed for either (the
new tables were already pushed to the live Supabase project via
`supabase db push`).

Next:
Deploy both pending features (TTS, recurring reminders + price
alerts), verify live, then decide on the remaining key-requiring tools
(weather, web search, calendar, Gmail - `TOOLS-001` suggested by
`npm run next`). See `docs/NEXT_ACTION.md`.

Last Updated:
2026-09-18
