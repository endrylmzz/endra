import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  vi.resetModules();
  process.env.GOOGLE_CLIENT_ID = "client-id";
  process.env.GOOGLE_CLIENT_SECRET = "client-secret";
  process.env.GOOGLE_REFRESH_TOKEN = "refresh-token";
});

afterEach(() => {
  vi.unstubAllGlobals();
  process.env = { ...ORIGINAL_ENV };
});

describe("getGoogleAccessToken", () => {
  it("exchanges the refresh token for an access token", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ access_token: "at-1", expires_in: 3600 }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const { getGoogleAccessToken } = await import("./oauth-client.js");

    const token = await getGoogleAccessToken();

    expect(token).toBe("at-1");
    const [, options] = fetchMock.mock.calls[0] as [string, { body: URLSearchParams }];
    expect(options.body.get("refresh_token")).toBe("refresh-token");
    expect(options.body.get("grant_type")).toBe("refresh_token");
  });

  it("caches the token and does not refetch until it's close to expiring", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ access_token: "at-1", expires_in: 3600 }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const { getGoogleAccessToken } = await import("./oauth-client.js");

    await getGoogleAccessToken();
    await getGoogleAccessToken();

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("throws a clear error when Google OAuth env vars are missing", async () => {
    delete process.env.GOOGLE_REFRESH_TOKEN;
    const { getGoogleAccessToken } = await import("./oauth-client.js");

    await expect(getGoogleAccessToken()).rejects.toThrow("Google OAuth is not configured");
  });

  it("throws when the refresh request fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 401 }));
    const { getGoogleAccessToken } = await import("./oauth-client.js");

    await expect(getGoogleAccessToken()).rejects.toThrow("Google token refresh failed: 401");
  });
});
