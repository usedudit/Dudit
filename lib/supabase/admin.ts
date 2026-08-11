import "server-only"
import { createClient } from "@supabase/supabase-js"

/**
 * Singleton admin (service role) Supabase client.
 * Bypasses ALL Row Level Security - use ONLY for server-side admin operations
 * that genuinely need to cross user/partner boundaries.
 *
 * DESIGN DECISION (LOW-06): This is an intentional module-level singleton.
 * The Supabase JS client is stateless for queries - it holds no per-request auth
 * state and does not cache query results. It is therefore safe to share across
 * requests in the same Node.js process (serverless function instance).
 *
 * IMPORTANT: Do NOT call `.auth.signInWithPassword()`, `.auth.setSession()`, or
 * any other auth mutation on this client. Those methods mutate internal state and
 * WOULD leak between requests. This client should only be used for database
 * queries (`.from()`) and storage operations.
 *
 * @see https://supabase.com/docs/reference/javascript/admin-api
 */
let _adminClient: any = null

export function getAdminClient(): any {
    if (_adminClient) return _adminClient

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "http://localhost:54321"
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "placeholder-key"

    _adminClient = createClient(supabaseUrl, serviceRoleKey, {
        auth: {
            autoRefreshToken: false,
            persistSession: false,
        },
    })

    return _adminClient
}
