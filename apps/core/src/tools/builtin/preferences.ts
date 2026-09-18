import type { EndraTool } from "@endra/agent-contracts";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseClient } from "../../db/supabase-client.js";
import { deletePreference, listPreferences, setPreference } from "../../memory/preferences.js";

// MEMORY-004's preferences store had no tool wired to it until now -
// this is what actually lets Ender say "şunu ayarla" and have it
// stick. Preferences are folded into the system prompt (see
// message-service.ts) so they shape every future reply, not just
// answer "what did I set X to."

// write-risk, no confirmation - a setting is low-stakes and trivially
// changed again.
export function createSetPreferenceTool(client: SupabaseClient = getSupabaseClient()): EndraTool {
  return {
    name: "set_preference",
    description:
      'Saves a persistent user preference/setting that should shape ENDRA\'s future behavior (e.g. key "reply_style", value "kısa ve direkt"). Use a short, stable, machine-friendly key (snake_case) and a plain string value.',
    category: "settings",
    riskLevel: "write",
    requiresConfirmation: false,
    inputSchema: {
      type: "object",
      required: ["key", "value"],
      properties: {
        key: { type: "string", description: 'e.g. "reply_style", "morning_digest_time"' },
        value: { type: "string" },
      },
      additionalProperties: false,
    },
    async execute(input, context) {
      const { key, value } = input as { key: string; value: string };
      await setPreference(context.userId, key, value, client);
      return { success: true, data: { key, value } };
    },
  };
}

// read-risk, no confirmation - shows every preference currently set.
export function createListPreferencesTool(client: SupabaseClient = getSupabaseClient()): EndraTool {
  return {
    name: "list_preferences",
    description: "Lists every preference/setting currently saved for the user.",
    category: "settings",
    riskLevel: "read",
    requiresConfirmation: false,
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    async execute(_input, context) {
      const preferences = await listPreferences(context.userId, client);
      return { success: true, data: preferences };
    },
  };
}

// write-risk, requires confirmation - mirrors this codebase's other
// delete-style tools (delete_note, cancel_reminder, ...).
export function createDeletePreferenceTool(
  client: SupabaseClient = getSupabaseClient(),
): EndraTool {
  return {
    name: "delete_preference",
    description: "Removes a saved preference/setting by key (use list_preferences to see keys).",
    category: "settings",
    riskLevel: "write",
    requiresConfirmation: true,
    inputSchema: {
      type: "object",
      required: ["key"],
      properties: { key: { type: "string" } },
      additionalProperties: false,
    },
    async execute(input, context) {
      const { key } = input as { key: string };
      await deletePreference(context.userId, key, client);
      return { success: true, data: { deleted: key } };
    },
  };
}
