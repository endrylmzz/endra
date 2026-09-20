import type { EndraTool } from "@endra/agent-contracts";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseClient } from "../../db/supabase-client.js";
import { findEntityByName, findMemoriesForEntity, listEntities } from "../../memory/entities.js";

// MEMORY-009: the promotion pipeline links memories to named entities
// (people, places, projects, organizations) it mentions. These two
// tools are the read side - browsing what's tracked, and pulling every
// memory linked to one entity for "what have we discussed about X"
// style questions.

export function createListEntitiesTool(client: SupabaseClient = getSupabaseClient()): EndraTool {
  return {
    name: "list_entities",
    description:
      "Lists the people, places, projects, and organizations ENDRA has tracked from past conversations.",
    category: "memory",
    riskLevel: "read",
    requiresConfirmation: false,
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    async execute(_input, context) {
      const entities = await listEntities(context.userId, client);
      return { success: true, data: entities };
    },
  };
}

export function createRecallAboutTool(client: SupabaseClient = getSupabaseClient()): EndraTool {
  return {
    name: "recall_about",
    description:
      "Finds every stored memory linked to a named entity (a person, place, project, or organization) - use for questions like 'what have we discussed about X'.",
    category: "memory",
    riskLevel: "read",
    requiresConfirmation: false,
    inputSchema: {
      type: "object",
      required: ["name"],
      properties: { name: { type: "string", description: "The entity's name, e.g. 'İzmir'" } },
      additionalProperties: false,
    },
    async execute(input, context) {
      const { name } = input as { name: string };
      const entity = await findEntityByName(context.userId, name, client);
      if (!entity) {
        return { success: true, data: { found: false } };
      }
      const memories = await findMemoriesForEntity(entity.id, client);
      return { success: true, data: { found: true, entity, memories } };
    },
  };
}
