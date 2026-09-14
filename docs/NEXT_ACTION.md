# NEXT ACTION

Continue task:
None in progress. ENDRA is deployed and working 24/7 - this is a real
milestone (see CLAUDE.md section 49's MVP definition: "Telegram
üzerinden konuşabiliyorum" is now true). Next is Ender's call again.

Goal:
Nothing blocking. What's next is which capability to build on top of
a now-live system.

Current state - Production deployment:

- Host: RepoCloud VPS, `vps-3737633d.vps.rcld.dev`, project name
  `endra-core`, cheapest tier (1 vCPU/2GB RAM/30GB SSD, ~$6/mo),
  deployed via RepoCloud's AI deploy agent (not manually set up -
  given custom instructions describing the build/start/health-check
  contract, see chat history for the exact instructions used).
- Both `apps/core` and `apps/telegram-adapter` run as systemd services
  (`endra-core`, `endra-telegram`) under a dedicated non-root `endra`
  user, auto-restart on failure, enabled on boot.
- `/opt/endra/.env` on the server holds the real secrets (separate
  from this repo's local `.env` - they had to be pasted into the
  RepoCloud deploy agent's chat once, manually, by Ender).
- Firewall: only SSH (22) open, deny-all inbound otherwise. Core's API
  is NOT publicly reachable - by design, only the Telegram adapter
  calls it, over localhost. This is a deliberate, good security
  default - don't "fix" this by opening a public port later without a
  real reason.
- Auto-updates: a nightly cron (02:17 UTC) pulls the latest `main` from
  GitHub, rebuilds, and restarts both services. Pushing to `main` on
  GitHub (`github.com/endrylmzz/endra`, now **public** - see below) is
  effectively continuous deployment; there is no staging environment
  or manual approval step before it reaches production.
- The repo was made **public** (Ender's choice) so RepoCloud's deploy
  form (which only accepts public repos on the simple path) could
  clone it directly. Verified before doing this: no secrets exist
  anywhere in git history (checked with `git log --all -p` grepping
  for known key/token fragments) - only a Telegram user id appears,
  which isn't a credential.
- Fixed during live use: Telegram was rendering literal `**asterisks**`
  instead of bold text - `TelegramClient.sendMessage` now sends
  `parse_mode: "Markdown"`, with a plain-text retry if Telegram's
  parser rejects the LLM's output (its Markdown parser is strict about
  balanced entities).
- The local dev machine's copies of `apps/core`/`apps/telegram-adapter`
  were stopped (they were briefly running in parallel with the VPS
  and caused a real Telegram long-polling conflict - "Conflict:
  terminated by other getUpdates request" - fixed by killing the local
  processes). Going forward, only start them locally for development/
  testing, not for Ender's actual daily use.

## What's next - same real options as before, now with a live system

- **Phase 2 (Memory)**: `MEMORY-004` (preferences) onward.
- **Phase 3 (Tools)**: `EndraTool` contract, registry, router,
  permissions, confirmation system.
- **Something new**: now that Ender is actually using ENDRA daily,
  real usage may surface its own priorities (e.g. voice, since OpenAI
  is already the provider; or a specific tool he wants first).

Important:

- Any future code change needs `npm test`/lint/format clean AND a real
  push to `main` to actually reach production now - there's no
  separate deploy step to forget, but also no safety net (no staging,
  no approval gate). Be more careful about what lands on `main`, since
  it auto-deploys nightly (and can be forced sooner via the RepoCloud
  agent's "Rebuild/Update" button).
- Don't touch the firewall/public-port setup without a concrete reason
  - Core being unreachable from the internet is intentional.
