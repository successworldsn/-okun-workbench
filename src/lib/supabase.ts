/**
 * Supabase server client.
 *
 * Service-role key, server-only (never imported by client components). If
 * SUPABASE creds are absent, DEMO_MODE flips on and every data-layer function
 * in lib/db.ts falls back to deterministic in-memory demo data so the app
 * renders without secrets, matching the okun-capital dashboard convention.
 */
import { createClient, SupabaseClient } from "@supabase/supabase-js";

const URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export const DEMO_MODE = !URL || !SERVICE_KEY;

let client: SupabaseClient | null = null;

export function db(): SupabaseClient {
  if (DEMO_MODE) {
    throw new Error("db() called in DEMO_MODE — check DEMO_MODE before calling db()");
  }
  if (!client) {
    client = createClient(URL as string, SERVICE_KEY as string, {
      auth: { persistSession: false },
    });
  }
  return client;
}
