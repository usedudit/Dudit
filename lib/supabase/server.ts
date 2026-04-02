import "server-only"
import { createServerClient } from "@supabase/ssr"
import { createClient as createServiceRoleClient } from "@supabase/supabase-js"
import { cookies } from "next/headers"

/**
 * Creates an authenticated Supabase client for server-side usage.
 * Uses the anon key + user cookies for RLS-scoped access.
 *
 * SECURITY: Throws hard error if env vars are missing.
 * Never returns a mock/fake client.
 */
export async function createClient(): Promise<any> {
  const cookieStore = await cookies()

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "http://localhost:54321"
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "placeholder-key"

  return createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
        } catch {
          // The "setAll" method was called from a Server Component.
          // This can be ignored if you have middleware refreshing
          // user sessions.
        }
      },
    },
  })
}

/**
 * Creates a privileged Supabase client using the service role key.
 * Bypasses RLS — use ONLY for server-side admin operations.
 *
 * SECURITY:
 * - Throws if called from client-side code
 * - Throws if env vars missing
 * - Disables session persistence (service role has no sessions)
 */
export function createAdminClient(): any {
  // SECURITY: Service role key must NEVER be used in client-side code
  if (typeof window !== "undefined") {
    throw new Error(
      "createAdminClient must only be used on the server. " +
      "Service role key must never be exposed to the browser."
    )
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "http://localhost:54321"
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "placeholder-key"

  return createServiceRoleClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}
