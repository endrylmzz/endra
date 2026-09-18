import { describe, expect, it, vi, afterEach } from "vitest";
import {
  createCreateCalendarEventTool,
  createDeleteCalendarEventTool,
  createListCalendarEventsTool,
} from "./calendar.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

const getAccessToken = vi.fn(async () => "access-token");

describe("createListCalendarEventsTool", () => {
  it("is a read tool that never requires confirmation", () => {
    const tool = createListCalendarEventsTool(getAccessToken);
    expect(tool.riskLevel).toBe("read");
    expect(tool.requiresConfirmation).toBe(false);
  });

  it("lists upcoming events with a simplified shape", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        items: [
          {
            id: "evt-1",
            summary: "Diş randevusu",
            start: { dateTime: "2026-09-20T10:00:00+03:00" },
            end: { dateTime: "2026-09-20T10:30:00+03:00" },
          },
        ],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const tool = createListCalendarEventsTool(getAccessToken);

    const result = await tool.execute({}, { userId: "u", conversationId: "c" });

    expect(result).toEqual({
      success: true,
      data: [
        {
          id: "evt-1",
          summary: "Diş randevusu",
          start: "2026-09-20T10:00:00+03:00",
          end: "2026-09-20T10:30:00+03:00",
        },
      ],
    });
    const [url] = fetchMock.mock.calls[0] as [URL];
    expect(url.toString()).toContain("calendars/primary/events");
  });

  it("returns a failure when the request fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 401 }));
    const tool = createListCalendarEventsTool(getAccessToken);

    const result = await tool.execute({}, { userId: "u", conversationId: "c" });

    expect(result.success).toBe(false);
  });
});

describe("createCreateCalendarEventTool", () => {
  it("is a write tool that requires confirmation", () => {
    const tool = createCreateCalendarEventTool(getAccessToken);
    expect(tool.riskLevel).toBe("write");
    expect(tool.requiresConfirmation).toBe(true);
  });

  it("posts the event and returns its id", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({ id: "evt-2", summary: "Toplantı" }) });
    vi.stubGlobal("fetch", fetchMock);
    const tool = createCreateCalendarEventTool(getAccessToken);

    const result = await tool.execute(
      {
        summary: "Toplantı",
        startDateTime: "2026-09-20T10:00:00+03:00",
        endDateTime: "2026-09-20T11:00:00+03:00",
      },
      { userId: "u", conversationId: "c" },
    );

    expect(result).toEqual({ success: true, data: { id: "evt-2", summary: "Toplantı" } });
    const [, options] = fetchMock.mock.calls[0] as [string, { method: string; body: string }];
    expect(options.method).toBe("POST");
    expect(JSON.parse(options.body)).toEqual({
      summary: "Toplantı",
      start: { dateTime: "2026-09-20T10:00:00+03:00" },
      end: { dateTime: "2026-09-20T11:00:00+03:00" },
    });
  });
});

describe("createDeleteCalendarEventTool", () => {
  it("is a write tool that requires confirmation", () => {
    const tool = createDeleteCalendarEventTool(getAccessToken);
    expect(tool.riskLevel).toBe("write");
    expect(tool.requiresConfirmation).toBe(true);
  });

  it("sends a DELETE request for the given event id", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 204 });
    vi.stubGlobal("fetch", fetchMock);
    const tool = createDeleteCalendarEventTool(getAccessToken);

    const result = await tool.execute({ eventId: "evt-1" }, { userId: "u", conversationId: "c" });

    expect(result).toEqual({ success: true, data: { deleted: "evt-1" } });
    const [url, options] = fetchMock.mock.calls[0] as [string, { method: string }];
    expect(url).toContain("evt-1");
    expect(options.method).toBe("DELETE");
  });
});
