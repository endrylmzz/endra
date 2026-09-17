# ENDRA PROJECT STATUS

Current Phase:
Phase 3 (Tools) fully done and deployed. Phases 1, 2, 4, 6, 7 all
done. Phase 5: notes, crypto, and now weather are done; only web
search (partially covered), calendar, and Gmail remain, and those
genuinely need a key/OAuth.

Overall Progress:
81% (see `npm run status`, computed from `docs/TASKS.yaml`)

Last Completed:
**Weather turned out not to need a key either.** `TOOLS-001`: new
`get_weather` tool using Open-Meteo (free geocoding + forecast, no API
key at all - unlike most weather providers) - give it a city name, get
back temperature/humidity/wind/condition. Also added
`search_wikipedia`, a partial, key-free stand-in for `TOOLS-002` (web
research): factual "kim/nedir/ne zaman" lookups via Wikipedia's free
REST API. Not a general web search - that still needs a paid search
API key - so `TOOLS-002` stays open.

Verified live against both real APIs (not mocks): a real Open-Meteo
call for Istanbul, and a real Wikipedia search+summary call for
"Mustafa Kemal Atatürk". Also added `convert_currency` (Frankfurter's
free ECB rates, no key) as a fiat-conversion companion to
`get_crypto_price`, verified live against the real API too. 190/190
tests, clean build, clean lint, clean format.

Before that, in the same session: recurring reminders and price alerts
(`PROACTIVE-002/003/005`) and text-to-speech replies
(`VOICE-003`/`VOICE-004`) - see `docs/DEVLOG.md` for details on each.

Currently Working:
(none)

Blocked:
None. **Three feature batches are sitting on `main`, none deployed
yet**: TTS, recurring reminders + price alerts, and weather + Wikipedia
search. No new secrets needed for any of them.

Next:
Ender wants a few more updates before deploying anything - continuing
to look for further key-free improvements. Once ready: one RepoCloud
rebuild covers everything sitting on `main` at once. `TOOLS-002` (full
web search), `TOOLS-003` (calendar), `TOOLS-004` (Gmail) remain and
need a key/OAuth from Ender when picked up.

Last Updated:
2026-09-18
