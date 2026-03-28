import "server-only"
import { cache } from "react"
import { getSupabaseServerClient } from "@/lib/supabase/request-client"
import type { User } from "@supabase/supabase-js"

/**
 * Single request-scoped auth resolver.
 * Ensures `auth.getUser()` is called EXACTLY ONCE per server request.
 */
export const getCurrentUser = cache(async (): Promise<User | null> => {
    const timestamp = new Date().toISOString()
    console.log(`[SUPABASE CALL] auth.getUser() at ${timestamp}`)
    const supabase = await getSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    return user
})

/**
 * Fast session-only auth resolver.
 * Reads user from cookies without server-side verification.
 * Use for initial UI state, not for security-critical actions.
 */
export const getCurrentSession = cache(async (): Promise<User | null> => {
    const supabase = await getSupabaseServerClient()
    const { data: { session } } = await supabase.auth.getSession()
    return session?.user || null
})