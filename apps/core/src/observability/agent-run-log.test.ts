import { describe, expect, it, vi, afterEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { logAgentRun } from "./agent-run-log.js";

describe("logAgentRun", () => {
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

    await logAgentRun(
      { provider: "openai", model: "gpt-5.6", status: "success", durationMs: 120 },
      client,
    );

    expect(insertCalls).toEqual([
      {
        conversation_id: null,
        user_id: null,
        provider: "openai",
        model: "gpt-5.6",
        status: "success",
        duration_ms: 120,
        input_tokens: null,
        output_tokens: null,
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
      logAgentRun({ provider: "openai", model: "gpt-5.6", status: "error", durationMs: 5 }, client),
    ).resolves.toBeUndefined();
    expect(consoleSpy).toHaveBeenCalled();
  });
});
