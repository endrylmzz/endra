import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createCancelWeatherAlertTool,
  createListWeatherAlertsTool,
  createSetWeatherAlertTool,
} from "./weather-alerts.js";

describe("createSetWeatherAlertTool", () => {
  it("is a write tool that does not require confirmation", () => {
    const tool = createSetWeatherAlertTool({} as SupabaseClient);
    expect(tool.riskLevel).toBe("write");
    expect(tool.requiresConfirmation).toBe(false);
  });

  it("inserts a temperature alert with direction and target", async () => {
    const insertCalls: unknown[] = [];
    const client = {
      from: () => ({
        insert: (values: unknown) => {
          insertCalls.push(values);
          return {
            select: () => ({ single: async () => ({ data: { id: "wa-1" }, error: null }) }),
          };
        },
      }),
    } as unknown as SupabaseClient;
    const tool = createSetWeatherAlertTool(client);

    const result = await tool.execute(
      { city: "Istanbul", kind: "temperature", direction: "above", targetTemperatureC: 30 },
      { userId: "user-1", conversationId: "conv-1" },
    );

    expect(insertCalls).toEqual([
      {
        user_id: "user-1",
        conversation_id: "conv-1",
        city: "Istanbul",
        kind: "temperature",
        direction: "above",
        target_temperature_c: 30,
      },
    ]);
    expect(result).toEqual({
      success: true,
      data: {
        id: "wa-1",
        city: "Istanbul",
        kind: "temperature",
        direction: "above",
        targetTemperatureC: 30,
      },
    });
  });

  it("inserts a precipitation alert without direction/target fields", async () => {
    const insertCalls: unknown[] = [];
    const client = {
      from: () => ({
        insert: (values: unknown) => {
          insertCalls.push(values);
          return {
            select: () => ({ single: async () => ({ data: { id: "wa-2" }, error: null }) }),
          };
        },
      }),
    } as unknown as SupabaseClient;
    const tool = createSetWeatherAlertTool(client);

    const result = await tool.execute(
      { city: "Ankara", kind: "precipitation" },
      { userId: "user-1", conversationId: "conv-1" },
    );

    expect(insertCalls).toEqual([
      { user_id: "user-1", conversation_id: "conv-1", city: "Ankara", kind: "precipitation" },
    ]);
    expect(result.success).toBe(true);
  });

  it("rejects a temperature alert missing direction/targetTemperatureC", async () => {
    const tool = createSetWeatherAlertTool({} as SupabaseClient);

    const result = await tool.execute(
      { city: "Istanbul", kind: "temperature" },
      { userId: "user-1", conversationId: "conv-1" },
    );

    expect(result.success).toBe(false);
  });
});

describe("createListWeatherAlertsTool", () => {
  it("is a read tool that never requires confirmation", () => {
    const tool = createListWeatherAlertsTool({} as SupabaseClient);
    expect(tool.riskLevel).toBe("read");
    expect(tool.requiresConfirmation).toBe(false);
  });
});

describe("createCancelWeatherAlertTool", () => {
  it("is a write tool that requires confirmation", () => {
    const tool = createCancelWeatherAlertTool({} as SupabaseClient);
    expect(tool.riskLevel).toBe("write");
    expect(tool.requiresConfirmation).toBe(true);
  });

  it("cancels only the calling user's pending alert with the given id", async () => {
    const eqCalls: unknown[] = [];
    const client = {
      from: () => ({
        update: () => ({
          eq: (column: string, value: unknown) => {
            eqCalls.push([column, value]);
            return {
              eq: (column2: string, value2: unknown) => {
                eqCalls.push([column2, value2]);
                return {
                  eq: (column3: string, value3: unknown) => {
                    eqCalls.push([column3, value3]);
                    return { error: null };
                  },
                };
              },
            };
          },
        }),
      }),
    } as unknown as SupabaseClient;
    const tool = createCancelWeatherAlertTool(client);

    const result = await tool.execute(
      { alertId: "wa-1" },
      { userId: "user-1", conversationId: "conv-1" },
    );

    expect(eqCalls).toEqual([
      ["id", "wa-1"],
      ["user_id", "user-1"],
      ["status", "pending"],
    ]);
    expect(result).toEqual({ success: true, data: { cancelled: "wa-1" } });
  });
});
