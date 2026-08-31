/**
 * Publishable-key Supabase client for public Watch Center reads.
 *
 * Anonymous reads only: RLS keeps unpublished events, draft articles and the
 * broadcast source table (tokens!) out of reach. Never use the admin client
 * for these surfaces.
 */

import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export function createPublicSupabase() {
  const url = process.env["SUPABASE_URL"];
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"];
  if (!url || !key) throw new Error("SUPABASE_PUBLIC_ENV_MISSING");

  return createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) => {
        const headers = new Headers(init?.headers);
        // Opaque `sb_` keys are not JWTs; PostgREST rejects them as bearer tokens.
        if (key.startsWith("sb_") && headers.get("Authorization") === `Bearer ${key}`) {
          headers.delete("Authorization");
        }
        headers.set("apikey", key);
        return fetch(input, { ...init, headers });
      },
    },
  });
}
