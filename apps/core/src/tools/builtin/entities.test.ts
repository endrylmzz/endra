import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createListEntitiesTool, createRecallAboutTool } from "./entities.js";

describe("createListEntitiesTool", () => {
  it("is a read tool that never requires confirmation", () => {
    const tool = createListEntitiesTool({} as SupabaseClient);
    expect(tool.riskLevel).toBe("read");
    expect(tool.requiresConfirmation).toBe(false);
  });

  it("lists the calling user's entities", async () => {
    const client = {
      from: () => ({
        select: () => ({
          eq: () => ({
            order: async () => ({
              data: [{ id: "entity-1", name: "İzmir", type: "place" }],
              error: null,
            }),
          }),
        }),
      }),
    } as unknown as SupabaseClient;
    const tool = createListEntitiesTool(client);

    const result = await tool.execute({}, { userId: "user-1", conversationId: "c" });

    expect(result).toEqual({
      success: true,
      data: [{ id: "entity-1", name: "İzmir", type: "place" }],
    });
  });
});

describe("createRecallAboutTool", () => {
  it("is a read tool that never requires confirmation", () => {
    const tool = createRecallAboutTool({} as SupabaseClient);
    expect(tool.riskLevel).toBe("read");
    expect(tool.requiresConfirmation).toBe(false);
  });

  it("returns found: false when no entity matches the given name", async () => {
    const client = {
      from: () => ({
        select: () => ({
          eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
        }),
      }),
    } as unknown as SupabaseClient;
    const tool = createRecallAboutTool(client);

    const result = await tool.execute(
      { name: "bilinmeyen biri" },
      { userId: "user-1", conversationId: "c" },
    );

    expect(result).toEqual({ success: true, data: { found: false } });
  });

  it("returns the entity and its linked memories when found", async () => {
    const client = {
      from: (table: string) => {
        if (table === "entities") {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  maybeSingle: async () => ({
                    data: { id: "entity-1", name: "İzmir", type: "place" },
                    error: null,
                  }),
                }),
              }),
            }),
          };
        }
        if (table === "memory_entities") {
          return {
            select: () => ({
              eq: vi.fn(async () => ({
                data: [{ memories: { id: "mem-1", content: "İzmir'e taşınmayı düşünüyorum" } }],
                error: null,
              })),
            }),
          };
        }
        throw new Error(`unexpected table ${table}`);
      },
    } as unknown as SupabaseClient;
    const tool = createRecallAboutTool(client);

    const result = await tool.execute({ name: "izmir" }, { userId: "user-1", conversationId: "c" });

    expect(result).toEqual({
      success: true,
      data: {
        found: true,
        entity: { id: "entity-1", name: "İzmir", type: "place" },
        memories: [{ id: "mem-1", content: "İzmir'e taşınmayı düşünüyorum" }],
      },
    });
  });
});
