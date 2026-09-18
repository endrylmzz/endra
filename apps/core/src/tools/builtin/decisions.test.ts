import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createLogDecisionTool,
  createListDecisionsTool,
  createResolveDecisionTool,
  listOpenDecisions,
} from "./decisions.js";

const ctx = { userId: "user-1", conversationId: "conv-1" };

function fakeClient(tables: Record<string, unknown>): SupabaseClient {
  return { from: (table: string) => tables[table] } as unknown as SupabaseClient;
}

describe("createLogDecisionTool", () => {
  it("is a write tool that does not require confirmation", () => {
    const tool = createLogDecisionTool({} as SupabaseClient);
    expect(tool.riskLevel).toBe("write");
    expect(tool.requiresConfirmation).toBe(false);
  });

  it("logs a decision without a follow-up when followUpInDays is omitted", async () => {
    const decisionInserts: unknown[] = [];
    const client = fakeClient({
      decisions: {
        insert: (values: unknown) => {
          decisionInserts.push(values);
          return {
            select: () => ({ single: async () => ({ data: { id: "dec-1" }, error: null }) }),
          };
        },
      },
    });
    const tool = createLogDecisionTool(client);

    const result = await tool.execute(
      { decision: "Yeni işe başlamaya karar verdim", reasoning: "Daha iyi maaş" },
      ctx,
    );

    expect(decisionInserts).toEqual([
      {
        user_id: "user-1",
        conversation_id: "conv-1",
        decision: "Yeni işe başlamaya karar verdim",
        reasoning: "Daha iyi maaş",
      },
    ]);
    expect(result).toEqual({
      success: true,
      data: { id: "dec-1", decision: "Yeni işe başlamaya karar verdim" },
    });
  });

  it("creates a follow-up reminder and links it when followUpInDays is given", async () => {
    const jobInserts: unknown[] = [];
    const decisionInserts: unknown[] = [];
    const client = fakeClient({
      scheduled_jobs: {
        insert: (values: unknown) => {
          jobInserts.push(values);
          return {
            select: () => ({ single: async () => ({ data: { id: "job-1" }, error: null }) }),
          };
        },
      },
      decisions: {
        insert: (values: unknown) => {
          decisionInserts.push(values);
          return {
            select: () => ({ single: async () => ({ data: { id: "dec-1" }, error: null }) }),
          };
        },
      },
    });
    const tool = createLogDecisionTool(client);

    const result = await tool.execute({ decision: "Spora başladım", followUpInDays: 14 }, ctx);

    expect(jobInserts).toHaveLength(1);
    expect((jobInserts[0] as { content: string }).content).toContain("Spora başladım");
    expect(decisionInserts).toEqual([
      {
        user_id: "user-1",
        conversation_id: "conv-1",
        decision: "Spora başladım",
        reasoning: null,
        follow_up_reminder_id: "job-1",
      },
    ]);
    expect(result.success).toBe(true);
    expect((result as { data: { followUpDate?: string } }).data.followUpDate).toBeDefined();
  });

  it("rejects a non-positive followUpInDays without touching the database", async () => {
    const tool = createLogDecisionTool({} as SupabaseClient);

    const result = await tool.execute({ decision: "x", followUpInDays: 0 }, ctx);

    expect(result.success).toBe(false);
  });
});

describe("createListDecisionsTool", () => {
  it("is a read tool that never requires confirmation", () => {
    const tool = createListDecisionsTool({} as SupabaseClient);
    expect(tool.riskLevel).toBe("read");
    expect(tool.requiresConfirmation).toBe(false);
  });

  it("filters to open decisions by default", async () => {
    const eqCalls: unknown[] = [];
    const client = fakeClient({
      decisions: {
        select: () => ({
          eq: (column: string, value: unknown) => {
            eqCalls.push([column, value]);
            return {
              eq: (column2: string, value2: unknown) => {
                eqCalls.push([column2, value2]);
                return { order: async () => ({ data: [], error: null }) };
              },
            };
          },
        }),
      },
    });
    const tool = createListDecisionsTool(client);

    await tool.execute({}, ctx);

    expect(eqCalls).toEqual([
      ["user_id", "user-1"],
      ["status", "open"],
    ]);
  });

  it("includes resolved decisions when includeResolved is true", async () => {
    const eqCalls: unknown[] = [];
    const client = fakeClient({
      decisions: {
        select: () => ({
          eq: (column: string, value: unknown) => {
            eqCalls.push([column, value]);
            return { order: async () => ({ data: [], error: null }) };
          },
        }),
      },
    });
    const tool = createListDecisionsTool(client);

    await tool.execute({ includeResolved: true }, ctx);

    expect(eqCalls).toEqual([["user_id", "user-1"]]);
  });
});

describe("createResolveDecisionTool", () => {
  it("is a write tool that does not require confirmation", () => {
    const tool = createResolveDecisionTool({} as SupabaseClient);
    expect(tool.riskLevel).toBe("write");
    expect(tool.requiresConfirmation).toBe(false);
  });

  it("sets status to resolved with the outcome, scoped to the calling user", async () => {
    const eqCalls: unknown[] = [];
    const client = fakeClient({
      decisions: {
        update: (values: unknown) => ({
          eq: (column: string, value: unknown) => {
            eqCalls.push([{ update: values }, column, value]);
            return {
              eq: (column2: string, value2: unknown) => {
                eqCalls.push([column2, value2]);
                return { error: null };
              },
            };
          },
        }),
      },
    });
    const tool = createResolveDecisionTool(client);

    const result = await tool.execute({ decisionId: "dec-1", outcome: "İyi gitti" }, ctx);

    expect(eqCalls[0]).toEqual([
      { update: { status: "resolved", outcome: "İyi gitti" } },
      "id",
      "dec-1",
    ]);
    expect(eqCalls[1]).toEqual(["user_id", "user-1"]);
    expect(result).toEqual({ success: true, data: { resolved: "dec-1" } });
  });
});

describe("listOpenDecisions", () => {
  it("returns open decisions for the user", async () => {
    const client = fakeClient({
      decisions: {
        select: () => ({
          eq: () => ({
            eq: async () => ({
              data: [{ id: "dec-1", decision: "x", reasoning: null }],
              error: null,
            }),
          }),
        }),
      },
    });

    const result = await listOpenDecisions("user-1", client);

    expect(result).toEqual([{ id: "dec-1", decision: "x", reasoning: null }]);
  });
});
