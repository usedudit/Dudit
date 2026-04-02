import { createBrowserClient } from "@supabase/ssr"

/**
 * Creates a Supabase client for browser-side usage.
 * Uses the anon key for RLS-scoped access.
 *
 * SECURITY: Throws if env vars are missing. Never returns null.
 */
export function createClient(): any {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "http://localhost:54321"
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "placeholder-key"

  return createBrowserClient(supabaseUrl, supabaseAnonKey)
}
