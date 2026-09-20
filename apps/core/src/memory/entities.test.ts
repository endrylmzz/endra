import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  findEntityByName,
  findMemoriesForEntity,
  findOrCreateEntity,
  linkMemoryToEntity,
  listEntities,
} from "./entities.js";

describe("findOrCreateEntity", () => {
  it("upserts on the normalized name and returns the entity id", async () => {
    const upsertCalls: unknown[] = [];
    const client = {
      from: () => ({
        upsert: (values: unknown) => {
          upsertCalls.push(values);
          return {
            select: () => ({ single: async () => ({ data: { id: "entity-1" }, error: null }) }),
          };
        },
      }),
    } as unknown as SupabaseClient;

    const id = await findOrCreateEntity("user-1", "  İzmir ", "place", client);

    expect(id).toBe("entity-1");
    expect(upsertCalls).toEqual([
      { user_id: "user-1", name: "  İzmir ", normalized_name: "izmir", type: "place" },
    ]);
  });

  it("normalizes Turkish İ/I the same as lowercase i/ı, so both mentions resolve to one entity", async () => {
    const upsertCalls: unknown[] = [];
    const client = {
      from: () => ({
        upsert: (values: unknown) => {
          upsertCalls.push(values);
          return {
            select: () => ({ single: async () => ({ data: { id: "entity-1" }, error: null }) }),
          };
        },
      }),
    } as unknown as SupabaseClient;

    await findOrCreateEntity("user-1", "İzmir", "place", client);
    await findOrCreateEntity("user-1", "izmir", "place", client);

    const normalizedNames = upsertCalls.map(
      (c) => (c as { normalized_name: string }).normalized_name,
    );
    expect(normalizedNames).toEqual(["izmir", "izmir"]);
  });
});

describe("linkMemoryToEntity", () => {
  it("upserts the memory/entity pair", async () => {
    const upsertCalls: unknown[] = [];
    const client = {
      from: () => ({
        upsert: (values: unknown) => {
          upsertCalls.push(values);
          return { error: null };
        },
      }),
    } as unknown as SupabaseClient;

    await linkMemoryToEntity("mem-1", "entity-1", client);

    expect(upsertCalls).toEqual([{ memory_id: "mem-1", entity_id: "entity-1" }]);
  });
});

describe("findEntityByName", () => {
  it("looks up by normalized name and returns the entity", async () => {
    const eqCalls: unknown[] = [];
    const client = {
      from: () => ({
        select: () => ({
          eq: (column: string, value: unknown) => {
            eqCalls.push([column, value]);
            return {
              eq: (column2: string, value2: unknown) => {
                eqCalls.push([column2, value2]);
                return {
                  maybeSingle: async () => ({
                    data: { id: "entity-1", name: "İzmir", type: "place" },
                    error: null,
                  }),
                };
              },
            };
          },
        }),
      }),
    } as unknown as SupabaseClient;

    const result = await findEntityByName("user-1", "izmir", client);

    expect(result).toEqual({ id: "entity-1", name: "İzmir", type: "place" });
    expect(eqCalls).toContainEqual(["normalized_name", "izmir"]);
  });

  it("returns undefined when nothing matches", async () => {
    const client = {
      from: () => ({
        select: () => ({
          eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
        }),
      }),
    } as unknown as SupabaseClient;

    const result = await findEntityByName("user-1", "yok-boyle-bir-sey", client);

    expect(result).toBeUndefined();
  });
});

describe("listEntities", () => {
  it("returns the user's entities ordered by name", async () => {
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

    const result = await listEntities("user-1", client);

    expect(result).toEqual([{ id: "entity-1", name: "İzmir", type: "place" }]);
  });
});

describe("findMemoriesForEntity", () => {
  it("returns the memories linked to the entity, unwrapped from the join", async () => {
    const client = {
      from: () => ({
        select: () => ({
          eq: vi.fn(async () => ({
            data: [
              { memories: { id: "mem-1", content: "İzmir'e taşınmayı düşünüyorum" } },
              { memories: { id: "mem-2", content: "İzmir'de iş görüşmesi var" } },
            ],
            error: null,
          })),
        }),
      }),
    } as unknown as SupabaseClient;

    const result = await findMemoriesForEntity("entity-1", client);

    expect(result).toEqual([
      { id: "mem-1", content: "İzmir'e taşınmayı düşünüyorum" },
      { id: "mem-2", content: "İzmir'de iş görüşmesi var" },
    ]);
  });

  it("throws on an error", async () => {
    const client = {
      from: () => ({
        select: () => ({ eq: async () => ({ data: null, error: new Error("db down") }) }),
      }),
    } as unknown as SupabaseClient;

    await expect(findMemoriesForEntity("entity-1", client)).rejects.toThrow("db down");
  });
});
