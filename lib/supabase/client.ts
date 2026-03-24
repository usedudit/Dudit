import { createBrowserClient } from "@supabase/ssr"

/**
 * Creates a Supabase client for browser-side usage.
 * Uses the anon key for RLS-scoped access.
 *
 * SECURITY: Throws if env vars are missing. Never returns null.
 */
export function createClient(): any {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      "[FATAL] Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY. " +
      "Browser Supabase client cannot initialize."
    )
  }

  return createBrowserClient(supabaseUrl, supabaseAnonKey)
}
