# ENDRA PROJECT STATUS

Current Phase:
**Phase 5 is fully done.** Phases 1, 2, 3, 4, 6, 7 all done too. All
that's left on the roadmap is Phase 8 (Web/PWA) and Phase 9 (Desktop) -
both explicitly out of scope for now per CLAUDE.md section 14 ("İlk
sürümlerde yapılmayacaklar").

Overall Progress:
85% (see `npm run status`, computed from `docs/TASKS.yaml`)

Last Completed:
**Calendar and Gmail, with real Google OAuth** (`TOOLS-003`/`TOOLS-004`).
Ender set up a Google Cloud project, OAuth consent screen, and a
Desktop-app OAuth client through Google Cloud Console; a one-time
script (`scripts/google-oauth-setup.mjs`) then captured a refresh
token into `.env`. New architecture piece, `ADR-008`, documents why
(loopback OAuth flow, raw REST over `googleapis`, and why this can
never be automated on Ender's behalf).

- `list_calendar_events` / `create_calendar_event` (confirmation
  required) / `delete_calendar_event` (confirmation required).
- `list_emails` / `read_email` (both read-only) / `send_email`
  (`riskLevel: "critical"`, always requires confirmation - CLAUDE.md
  section 6's named example of a critical action).

Verified live against the real Google account (not mocks): listed the
real calendar, created a real test event, confirmed it appeared, then
deleted it; listed real inbox messages and read one's real decoded
body; sent a real test email to Ender's own address and read it back.
**Found and fixed a real bug this way**: the first live send came back
with a mangled Subject line (raw UTF-8 in an email header needs RFC
2047 encoding, unlike the body) - fixed, then re-verified live with a
Turkish-character subject that came back correctly. 242/242 tests,
clean build, clean lint, clean format.

Before that, in the same multi-day session: `web_search`/`run_code`
(OpenAI-hosted, closing `TOOLS-002` for real), weather-based
conditional monitors + reminder retry + a multi-tool-call confirmation
fix + `list_capabilities`, weather/Wikipedia/currency tools, recurring
reminders + price alerts, and text-to-speech replies - see
`docs/DEVLOG.md` for details on each.

Currently Working:
(none)

Blocked:
None. **Six feature batches are sitting on `main`, none deployed yet**:
TTS, recurring reminders + price alerts, weather/Wikipedia/currency,
the retry/multi-tool-fix/capabilities round, web_search/run_code, and
this Calendar/Gmail round. The last one needs new secrets on the VPS
(`GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`/`GOOGLE_REFRESH_TOKEN`) -
everything else reuses what's already configured there.

Next:
Every tool-shaped roadmap item is now done. Deploy what's sitting on
`main` (remembering the new Google env vars this time), and verify the
new tools via a real Telegram message. After that, further work is
either Phase 8/9 (currently out of scope) or whatever Ender wants next

- ask him directly rather than assuming. See `docs/NEXT_ACTION.md`.

Last Updated:
2026-09-19
