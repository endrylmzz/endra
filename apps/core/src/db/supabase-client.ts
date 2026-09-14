// Minimal Supabase client wrapper. Connection only for now - the actual
// memory/conversation persistence layer (MEMORY-003+) builds on top of
// this. Uses the secret key (server-side, bypasses RLS) since Core is a
// trusted backend service, never the browser.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | undefined;

export function getSupabaseClient(): SupabaseClient {
  if (client) return client;

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) {
    throw new Error("SUPABASE_URL and SUPABASE_SECRET_KEY must be set");
  }

  client = createClient(url, key);
  return client;
}
