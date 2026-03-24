import "server-only"
import { createClient } from "@supabase/supabase-js"

/**
 * Singleton admin (service role) Supabase client.
 * Bypasses RLS — use ONLY for server-side admin operations.
 *
 * This module-level singleton avoids re-creating the client on every call,
 * reducing overhead in serverless environments.
 */
let _adminClient: any = null

export function getAdminClient(): any {
    if (_adminClient) return _adminClient

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!supabaseUrl || !serviceRoleKey) {
        throw new Error(
            "[FATAL] Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. " +
            "Admin client cannot initialize."
        )
    }

    _adminClient = createClient(supabaseUrl, serviceRoleKey, {
        auth: {
            autoRefreshToken: false,
            persistSession: false,
        },
    })

    return _adminClient
}
