import { createBrowserClient } from "@supabase/ssr"

let browserClient: any = null

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
    throw new Error("Missing Supabase browser environment variables: NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY must be defined.")
  }

  // Reuse one GoTrue client in the browser so multiple client components do
  // not create independent auth listeners or compete on token refresh.
  // Keep server calls request-scoped: a module-level server client could leak
  // one user's cookie/session into another request.
  if (typeof window !== "undefined") {
    if (!browserClient) {
      browserClient = createBrowserClient(supabaseUrl, supabaseAnonKey)
    }

    return browserClient
  }

  return createBrowserClient(supabaseUrl, supabaseAnonKey)
}
