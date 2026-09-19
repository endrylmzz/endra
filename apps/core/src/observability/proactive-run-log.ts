// Audit trail for the proactive/scheduled checks (memory hygiene,
// morning digest, ambient watch) - mirrors agent-run-log.ts's shape.
// Called only at meaningful points (a delivered notification, or a
// per-user failure), not on every silent tick.

import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseClient } from "../db/supabase-client.js";

export interface ProactiveRunLogEntry {
  checkName: string;
  userId?: string;
  status: "success" | "error";
  detail?: string;
  errorMessage?: string;
}

export async function logProactiveRun(
  entry: ProactiveRunLogEntry,
  client: SupabaseClient = getSupabaseClient(),
): Promise<void> {
  const { error } = await client.from("proactive_runs").insert({
    check_name: entry.checkName,
    user_id: entry.userId ?? null,
    status: entry.status,
    detail: entry.detail ?? null,
    error_message: entry.errorMessage ?? null,
  });

  if (error) {
    // A logging failure must not take down the proactive check itself -
    // surface it in the process logs and move on.
    console.error({ err: error }, "failed to write proactive_runs log entry");
  }
}
