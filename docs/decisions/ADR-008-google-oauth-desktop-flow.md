# ADR-008 Google OAuth via a Desktop-App Loopback Flow

Status: Accepted

Context:
`TOOLS-003` (Calendar) and `TOOLS-004` (Gmail) need Ender's own Google
account data, which means real OAuth 2.0 - not a static API key like
every tool built before this. ENDRA has no web frontend today (`apps/web`
is reserved until Phase 8) and Core's HTTP API isn't exposed publicly
(ADR-006), so the standard "redirect to a public callback URL" web-app
OAuth flow doesn't apply here.

Decision:
Use Google's "Desktop app" OAuth client type with the loopback
(`http://127.0.0.1:<port>/callback`) redirect flow, done once via a
standalone script (`scripts/google-oauth-setup.mjs`) that Ender runs
locally: it prints the consent URL, Ender opens it and approves in his
own browser (logged into his own Google account - this step can never
be automated on his behalf), and the script catches the redirect,
exchanges the code for a refresh token, and writes it into `.env`.
From then on, `apps/core/src/google/oauth-client.ts` mints short-lived
access tokens from that refresh token on demand, with a small
in-memory cache.

Calendar/Gmail tools call Google's REST APIs directly via `fetch`
rather than the `googleapis` npm package - consistent with every other
external API integration in this codebase (Telegram, CoinGecko,
Open-Meteo, Wikipedia, Frankfurter): no new SDK dependency for two
REST APIs simple enough to call directly.

Reasons:

- No public HTTPS callback exists (or is wanted) for a personal,
  single-user backend service - the loopback flow is Google's own
  supported answer to exactly this case ("installed application").
- The one-time setup script only needs to run once per token; the
  ongoing `refresh_token` -> `access_token` exchange needs no browser
  and runs entirely server-side in Core.
- Keeps the "explicit permission required" boundary intact: logging
  into Ender's Google account and clicking through OAuth consent is
  something only Ender can legitimately do, never automated on his
  behalf.

Alternatives:

- A full web OAuth flow with a public redirect URI hosted on the
  `endra-core` VPS. Rejected: would require exposing a new public
  endpoint (reopening the ADR-006 firewall question) for a flow that
  only ever needs to run once.
- The `googleapis` npm package. Rejected: heavier than needed for two
  REST APIs; raw `fetch` matches every other integration already in
  this codebase and keeps the dependency footprint the same.
- Google Workspace domain-wide delegation (no per-user consent needed).
  Rejected: Ender's Google account is a personal Gmail account, not a
  Workspace/organization account, so this path isn't available.

Consequences:

- The app's OAuth consent screen is in "Testing" status (External
  user type, Ender added as the sole test user) - Google may expire
  the refresh token after 7 days in this mode. If that happens, either
  publish the app to production (no verification needed for these
  scopes at this user count, just an unverified-app warning to click
  through once) or re-run `scripts/google-oauth-setup.mjs`.
- `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`/`GOOGLE_REFRESH_TOKEN` must
  be set in both local `.env` and the VPS's production environment
  (not committed - `.gitignore` already covers `.env`).
- `send_email` is `riskLevel: "critical"` with `requiresConfirmation:
true` per CLAUDE.md section 6's explicit example - it can never fire
  without Ender's in-chat approval, regardless of how the LLM phrases
  anything (same guarantee as every other confirmation-gated tool).
