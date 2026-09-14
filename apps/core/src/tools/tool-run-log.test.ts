import { describe, expect, it, vi, afterEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { logToolRun } from "./tool-run-log.js";

describe("logToolRun", () => {
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

    await logToolRun(
      { toolName: "calculator", arguments: { expression: "1+1" }, status: "success", result: 2 },
      client,
    );

    expect(insertCalls).toEqual([
      {
        conversation_id: null,
        user_id: null,
        tool_name: "calculator",
        arguments: { expression: "1+1" },
        status: "success",
        result: 2,
        duration_ms: null,
        error_message: null,
      },
    ]);
  });

  it("does not throw when the insert fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const client = {
      from: () => ({ insert: () => ({ error: new Error("insert failed") }) }),
    } as unknown as SupabaseClient;

    await expect(
      logToolRun({ toolName: "calculator", arguments: {}, status: "error" }, client),
    ).resolves.toBeUndefined();
  });
});
