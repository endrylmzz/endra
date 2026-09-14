// CLAUDE.md section 28 / ADR-003: the bot is not public. Only user ids
// listed in ENDRA_ALLOWED_TELEGRAM_USERS may reach ENDRA Core. An
// unset/empty allowlist means nobody is authorized (fail closed).

export function isAuthorized(userId: number, allowedUsersEnv: string | undefined): boolean {
  if (!allowedUsersEnv) return false;
  const allowed = allowedUsersEnv
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
  return allowed.includes(String(userId));
}
