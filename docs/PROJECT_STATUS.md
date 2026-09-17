# ENDRA PROJECT STATUS

Current Phase:
Phase 3 (Tools) fully done and deployed. Phases 1, 2, 4 done. All of
Phase 7 (Voice) plus several Phase 5/6 tasks (reminders, scheduled
delivery) done early, out of order, as real needs came up rather than
waiting on the full phase sequence.

Overall Progress:
76% (see `npm run status`, computed from `docs/TASKS.yaml`)

Last Completed:
**ENDRA can now talk back.** `VOICE-003`/`VOICE-004`: when the
incoming message was a voice note, the reply comes back as a Telegram
voice note too (OpenAI `gpt-4o-mini-tts`, `response_format: "opus"` -
native Telegram voice-note format, no transcoding needed). Text in
still gets text out - this mirrors the turn's input modality rather
than adding a new setting. Falls back to text-only on any TTS failure
instead of breaking the reply. If a turn produces both a generated
image and a voice reply (e.g. a voice request to draw something),
Telegram gets both messages, with the caption on the photo only (no
duplicate text on the voice note).

Verified live against the real OpenAI API (not mocks): a real
`gpt-4o-mini-tts` call returned a valid OGG/Opus file (magic bytes
checked). 161/161 tests, clean build, clean lint, clean format.

Before that, reminders shipped and were deployed: `set_reminder` /
`list_reminders` / `cancel_reminder` tools (`TOOLS-006`), a
`scheduled_jobs` table, and an in-process scheduler in `apps/core`
(`PROACTIVE-001`/`PROACTIVE-004`) that polls every 30s and delivers due
reminders. New architecture piece, `ADR-007`: Core stays
channel-agnostic - `apps/telegram-adapter` exposes a tiny
localhost-only `POST /push` endpoint (shared-secret guarded) that Core
calls instead of speaking Telegram's Bot API itself. Confirmed working
in production 2026-09-17.

Also closed out several roadmap items that turned out to already be
done or not worth doing right now: `MEMORY-008`, `TOOLS-005`,
`TOOLS-007` (already shipped under earlier work, just unmarked), and
`TELEGRAM-002` (n8n Telegram trigger - explored, real blockers found,
explicitly skipped for now; see `docs/NEXT_ACTION.md`).

Currently Working:
(none)

Blocked:
None. **Not yet deployed** - the TTS feature needs a RepoCloud rebuild
of both services. No new env vars or secrets needed (reuses the
existing `OPENAI_API_KEY`).

Next:
Deploy the TTS feature and verify once via a real voice message on
Telegram, then decide what's next - a key-requiring tool (weather, web
search, calendar, Gmail - `TOOLS-001` suggested by `npm run next`), or
more key-free work (recurring reminders/condition monitors -
`PROACTIVE-002`/`PROACTIVE-003`/`PROACTIVE-005`). See
`docs/NEXT_ACTION.md`.

Last Updated:
2026-09-18
