import { cache } from "react"
import { createClient } from "@/lib/supabase/server"

/**
 * Creates a single request-scoped Supabase client.
 * Uses React cache() to ensure the client is instantiated only ONCE per request.
 * Eliminates duplicate database connections and redundant auth calls.
 */
export const getSupabaseServerClient = cache(async () => {
    return await createClient()
})
