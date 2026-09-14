# ENDRA PROJECT STATUS

Current Phase:
Phase 4 — Telegram (fully done except the eventual n8n workflow,
TELEGRAM-002 - see ADR-005)

Overall Progress:
45% (see `npm run status`, computed from `docs/TASKS.yaml`)

Last Completed:
**ENDRA is deployed and running 24/7.** `apps/core` and
`apps/telegram-adapter` run as systemd services on a RepoCloud VPS
(`vps-3737633d.vps.rcld.dev`), deployed via RepoCloud's AI deploy
agent from the public GitHub repo (`github.com/endrylmzz/endra`).
Ender can message @endraaibot from his phone any time, machine off or
not. Also fixed: Telegram was showing raw `**markdown**` instead of
rendering it - `sendMessage` now uses `parse_mode: "Markdown"` with a
plain-text fallback if Telegram's strict parser rejects something.

Currently Working:
(none)

Blocked:
None. Local dev machine no longer runs Core/adapter for Ender's daily
use - only for development/testing going forward.

Next:
Ender's choice: deeper memory (Phase 2), tools (Phase 3), or something
else entirely now that ENDRA is actually usable day-to-day. See
`docs/NEXT_ACTION.md`.

Last Updated:
2026-09-14
