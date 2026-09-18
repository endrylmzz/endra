import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  checkWeatherAlerts,
  findPendingWeatherAlerts,
  markWeatherAlertTriggered,
} from "./weather-alerts.js";

function tempAlertRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "wa-1",
    city: "Istanbul",
    kind: "temperature",
    direction: "above",
    target_temperature_c: 30,
    conversations: { channel: "telegram", external_conversation_id: "42" },
    ...overrides,
  };
}

describe("findPendingWeatherAlerts", () => {
  it("maps pending alerts joined with their conversation's channel/external id", async () => {
    const client = {
      from: () => ({
        select: () => ({ eq: async () => ({ data: [tempAlertRow()], error: null }) }),
      }),
    } as unknown as SupabaseClient;

    const result = await findPendingWeatherAlerts(client);

    expect(result).toEqual([
      {
        id: "wa-1",
        city: "Istanbul",
        kind: "temperature",
        direction: "above",
        targetTemperatureC: 30,
        channel: "telegram",
        externalConversationId: "42",
      },
    ]);
  });
});

describe("markWeatherAlertTriggered", () => {
  it("sets status to triggered by id", async () => {
    const eqCalls: unknown[] = [];
    const client = {
      from: () => ({
        update: (values: unknown) => ({
          eq: (column: string, value: unknown) => {
            eqCalls.push([values, column, value]);
            return { error: null };
          },
        }),
      }),
    } as unknown as SupabaseClient;

    await markWeatherAlertTriggered("wa-1", client);

    expect(eqCalls).toEqual([[{ status: "triggered" }, "id", "wa-1"]]);
  });
});

describe("checkWeatherAlerts", () => {
  it("triggers a temperature 'above' alert once crossed", async () => {
    const updates: unknown[] = [];
    const client = {
      from: () => ({
        select: () => ({ eq: async () => ({ data: [tempAlertRow()], error: null }) }),
        update: (values: unknown) => ({
          eq: (column: string, value: unknown) => {
            updates.push({ values, column, value });
            return { error: null };
          },
        }),
      }),
    } as unknown as SupabaseClient;
    const fetchWeather = vi.fn().mockResolvedValue({
      city: "İstanbul",
      temperatureC: 31,
      weatherCode: 0,
      condition: "açık",
    });
    const deliver = vi.fn().mockResolvedValue(undefined);

    await checkWeatherAlerts(client, fetchWeather, deliver);

    expect(fetchWeather).toHaveBeenCalledWith("Istanbul");
    expect(deliver).toHaveBeenCalledWith("42", expect.stringContaining("30°C"));
    expect(updates).toEqual([{ values: { status: "triggered" }, column: "id", value: "wa-1" }]);
  });

  it("does not trigger a temperature alert before the threshold is crossed", async () => {
    const client = {
      from: () => ({
        select: () => ({ eq: async () => ({ data: [tempAlertRow()], error: null }) }),
        update: () => ({ eq: () => ({ error: null }) }),
      }),
    } as unknown as SupabaseClient;
    const fetchWeather = vi.fn().mockResolvedValue({
      city: "İstanbul",
      temperatureC: 25,
      weatherCode: 0,
      condition: "açık",
    });
    const deliver = vi.fn();

    await checkWeatherAlerts(client, fetchWeather, deliver);

    expect(deliver).not.toHaveBeenCalled();
  });

  it("triggers a precipitation alert once a rain/snow/storm code is seen", async () => {
    const client = {
      from: () => ({
        select: () => ({
          eq: async () => ({
            data: [
              tempAlertRow({ kind: "precipitation", direction: null, target_temperature_c: null }),
            ],
            error: null,
          }),
        }),
        update: () => ({ eq: () => ({ error: null }) }),
      }),
    } as unknown as SupabaseClient;
    const fetchWeather = vi.fn().mockResolvedValue({
      city: "İstanbul",
      temperatureC: 15,
      weatherCode: 61,
      condition: "hafif yağmurlu",
    });
    const deliver = vi.fn().mockResolvedValue(undefined);

    await checkWeatherAlerts(client, fetchWeather, deliver);

    expect(deliver).toHaveBeenCalledWith("42", expect.stringContaining("hafif yağmurlu"));
  });

  it("does not trigger a precipitation alert while it's just cloudy", async () => {
    const client = {
      from: () => ({
        select: () => ({
          eq: async () => ({
            data: [
              tempAlertRow({ kind: "precipitation", direction: null, target_temperature_c: null }),
            ],
            error: null,
          }),
        }),
        update: () => ({ eq: () => ({ error: null }) }),
      }),
    } as unknown as SupabaseClient;
    const fetchWeather = vi.fn().mockResolvedValue({
      city: "İstanbul",
      temperatureC: 15,
      weatherCode: 3,
      condition: "kapalı",
    });
    const deliver = vi.fn();

    await checkWeatherAlerts(client, fetchWeather, deliver);

    expect(deliver).not.toHaveBeenCalled();
  });

  it("logs and continues when the weather lookup fails, without throwing", async () => {
    const client = {
      from: () => ({
        select: () => ({ eq: async () => ({ data: [tempAlertRow()], error: null }) }),
        update: () => ({ eq: () => ({ error: null }) }),
      }),
    } as unknown as SupabaseClient;
    const fetchWeather = vi.fn().mockRejectedValue(new Error("open-meteo down"));
    const deliver = vi.fn();

    await expect(checkWeatherAlerts(client, fetchWeather, deliver)).resolves.toBeUndefined();
    expect(deliver).not.toHaveBeenCalled();
  });
});
