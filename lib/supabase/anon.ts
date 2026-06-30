import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/** Anon client for public reads — works at build time (no cookies). */
export function createAnonClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
