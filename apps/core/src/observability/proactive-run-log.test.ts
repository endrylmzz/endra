import { describe, expect, it, vi, afterEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { logProactiveRun } from "./proactive-run-log.js";

describe("logProactiveRun", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("inserts a row with the given fields, defaulting optional ones to null", async () => {
    const insertCalls: unknown[] = [];
    const client = {
      from: () => ({
        insert: (values: unknown) => {
          insertCalls.push(values);
          return { error: null };
        },
      }),
    } as unknown as SupabaseClient;

    await logProactiveRun(
      { checkName: "ambient_watch", userId: "user-1", status: "success", detail: "notified" },
      client,
    );

    expect(insertCalls).toEqual([
      {
        check_name: "ambient_watch",
        user_id: "user-1",
        status: "success",
        detail: "notified",
        error_message: null,
      },
    ]);
  });

  it("defaults userId/detail/errorMessage to null when omitted", async () => {
    const insertCalls: unknown[] = [];
    const client = {
      from: () => ({
        insert: (values: unknown) => {
          insertCalls.push(values);
          return { error: null };
        },
      }),
    } as unknown as SupabaseClient;

    await logProactiveRun({ checkName: "memory_hygiene", status: "error" }, client);

    expect(insertCalls).toEqual([
      {
        check_name: "memory_hygiene",
        user_id: null,
        status: "error",
        detail: null,
        error_message: null,
      },
    ]);
  });

  it("does not throw when the insert fails - logs to console.error instead", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const client = {
      from: () => ({
        insert: () => ({ error: new Error("insert failed") }),
      }),
    } as unknown as SupabaseClient;

    await expect(
      logProactiveRun({ checkName: "morning_digest", status: "error" }, client),
    ).resolves.toBeUndefined();
    expect(consoleSpy).toHaveBeenCalled();
  });
});
