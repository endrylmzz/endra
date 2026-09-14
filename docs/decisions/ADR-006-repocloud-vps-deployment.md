# ADR-006 Deploy to a RepoCloud VPS (Not Coolify, Not Inside n8n)

Status: Accepted

Context:
ADR-005 made ENDRA usable locally via a temporary Telegram adapter but
left deployment (24/7 availability) unresolved. Ender already pays for
a RepoCloud n8n instance ("n8n-ender"), and wanted to avoid paying for
a second, separate hosting service if RepoCloud could host Core
directly. Investigation found:

- RepoCloud's n8n deployment is a managed, autoscaling single-purpose
  container - no SSH/shell access, no way to run an additional
  arbitrary service alongside it.
- RepoCloud's "Coolify VPS" marketplace listing does not provision
  anything through RepoCloud - it links out to Coolify's own generic
  external self-hosted install docs, which would require getting a
  VPS from somewhere else entirely first. A dead end for "use what
  we're already paying for."
- RepoCloud does have its own native "Deploy App to Virtual Private
  Server" feature (separate from both of the above): give it a public
  GitHub repo, and their AI deploy agent provisions a dedicated VPS,
  clones the repo, and sets the app up to run continuously - drawing
  from the same account balance as the n8n instance.

Decision:
Deploy `apps/core` and `apps/telegram-adapter` together on one
RepoCloud VPS (project `endra-core`, cheapest tier - 1 vCPU/2GB RAM/
30GB SSD, ~$6/mo) via RepoCloud's native "Deploy App to VPS" flow,
using custom instructions describing the build (`npm install && npm
run build`), start (`npm start`), and health-check (`GET /health`)
contract. To use this flow, `github.com/endrylmzz/endra` was made
public (it only accepted a public repo on the simple path) - verified
first that no secrets exist anywhere in git history.

Reasons:

- Single account/balance with the existing n8n instance - no second
  hosting service, no second bill, no second set of credentials to
  manage.
- No Coolify layer to install/maintain ourselves - RepoCloud's own AI
  agent handled provisioning, systemd services, firewall, log
  rotation, and auto-update cron directly.
- Doesn't require Ender to manage a VPS by hand (SSH, OS packages,
  process supervision) - the deploy agent did that setup work.

Alternatives:

- A separate PaaS (Railway/Render/Fly.io). Rejected: extra account,
  extra bill, when RepoCloud's own native VPS-deploy feature turned
  out to do the same job on infrastructure already being paid for.
- Self-managed VPS + Coolify (Hetzner/DigitalOcean + Coolify install).
  Rejected for now: more moving parts to maintain (OS, Docker, Coolify
  itself) for no benefit over what RepoCloud's deploy agent already
  provided directly.
- Rewriting Core's logic as n8n workflow nodes to run entirely inside
  the existing n8n instance. Rejected: n8n's container has no route to
  run a second, independent long-running Node service anyway (the
  actual blocker), and this would have meant giving up the tested,
  git-versioned TypeScript codebase for no longer any real reason once
  a VPS was available.

Consequences:

- Making the repo public is effectively permanent unless deliberately
  reversed - re-verify no secrets before any future push (this is
  already covered by `.gitignore` for `.env`, but worth remembering).
- Pushing to `main` on GitHub now reaches production the same night
  (nightly auto-update cron pulls and rebuilds) - there is no staging
  environment or approval gate. Treat `main` accordingly.
- Core's HTTP API is intentionally not exposed to the public internet
  (firewall allows only SSH; the Telegram adapter calls Core over
  localhost on the same VPS). Any future channel that needs to reach
  Core from outside that VPS (e.g. n8n calling it once ADR-005's
  TELEGRAM-002 migration happens) will need this revisited.
- This adapter/deployment combination is still the ADR-005 "temporary
  bridge," now just running in production instead of locally - it does
  not change the plan to eventually move Telegram handling into n8n.
