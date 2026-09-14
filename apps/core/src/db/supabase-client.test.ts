import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

describe("getSupabaseClient", () => {
  const previousUrl = process.env.SUPABASE_URL;
  const previousKey = process.env.SUPABASE_SECRET_KEY;

  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    if (previousUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = previousUrl;
    if (previousKey === undefined) delete process.env.SUPABASE_SECRET_KEY;
    else process.env.SUPABASE_SECRET_KEY = previousKey;
  });

  it("throws if SUPABASE_URL/SUPABASE_SECRET_KEY are not set", async () => {
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SECRET_KEY;

    const { getSupabaseClient } = await import("./supabase-client.js");
    expect(() => getSupabaseClient()).toThrow(/SUPABASE_URL/);
  });

  it("returns the same client instance on repeated calls", async () => {
    process.env.SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SECRET_KEY = "sb_secret_test";

    const { getSupabaseClient } = await import("./supabase-client.js");
    const first = getSupabaseClient();
    const second = getSupabaseClient();

    expect(second).toBe(first);
  });
});
