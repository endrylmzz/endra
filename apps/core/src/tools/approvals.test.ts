import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createApproval, getApproval, resolveApprovalStatus } from "./approvals.js";

function fakeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "approval-1",
    tool_name: "notes",
    arguments: { content: "hi" },
    status: "pending",
    expires_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("createApproval", () => {
  it("inserts a pending approval and returns it in camelCase", async () => {
    const insertCalls: unknown[] = [];
    const client = {
      from: () => ({
        insert: (values: unknown) => {
          insertCalls.push(values);
          return { select: () => ({ single: async () => ({ data: fakeRow(), error: null }) }) };
        },
      }),
    } as unknown as SupabaseClient;

    const approval = await createApproval(
      { userId: "u1", conversationId: "c1", toolName: "notes", arguments: { content: "hi" } },
      client,
    );

    expect(approval).toEqual({
      id: "approval-1",
      toolName: "notes",
      arguments: { content: "hi" },
      status: "pending",
      expiresAt: "2026-01-01T00:00:00.000Z",
    });
    expect(insertCalls[0]).toMatchObject({
      user_id: "u1",
      conversation_id: "c1",
      tool_name: "notes",
      arguments: { content: "hi" },
    });
  });
});

describe("getApproval", () => {
  it("returns undefined when the approval doesn't exist", async () => {
    const client = {
      from: () => ({
        select: () => ({
          eq: function () {
            return this;
          },
          maybeSingle: async () => ({ data: null, error: null }),
        }),
      }),
    } as unknown as SupabaseClient;

    expect(await getApproval("missing", client)).toBeUndefined();
  });
});

describe("resolveApprovalStatus", () => {
  it("updates status only for pending approvals", async () => {
    const eqCalls: unknown[] = [];
    const client = {
      from: () => ({
        update: () => ({
          eq: (column: string, value: unknown) => {
            eqCalls.push([column, value]);
            return {
              eq: (column2: string, value2: unknown) => {
                eqCalls.push([column2, value2]);
                return { error: null };
              },
            };
          },
        }),
      }),
    } as unknown as SupabaseClient;

    await resolveApprovalStatus("approval-1", "approved", client);

    expect(eqCalls).toEqual([
      ["id", "approval-1"],
      ["status", "pending"],
    ]);
  });
});
