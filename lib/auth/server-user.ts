import "server-only"
import { cache } from "react"
import { getSupabaseServerClient } from "@/lib/supabase/request-client"
import type { User } from "@supabase/supabase-js"

import { headers } from "next/headers"

/**
 * Single request-scoped auth resolver.
 * Ensures `auth.getUser()` is called AT MOST ONCE per server request.
 * If the middleware already verified the user, it reads from headers to avoid a redundant call.
 */
export const getCurrentUser = cache(async (): Promise<User | null> => {
    const timestamp = new Date().toISOString()
    
    // 1. Try to get user from middleware headers (passed to the page)
    const headerList = await headers()
    const userId = headerList.get("x-user-id")
    const userEmail = headerList.get("x-user-email")
    const skipAuthFallback = headerList.get("x-skip-auth-fallback") === "true"

    if (skipAuthFallback) {
        return null
    }

    if (userId) {
        console.log(`[OPT] getCurrentUser() returning from HEADERS at ${timestamp} for ${userEmail}`)
        return {
            id: userId,
            email: userEmail || undefined,
            app_metadata: {},
            user_metadata: {},
            aud: "authenticated",
            created_at: "",
        } as User
    }

    // 2. Fallback to full Supabase verification if headers are missing
    console.log(`[SUPABASE CALL] auth.getUser() (FALLBACK) at ${timestamp}`)
    const supabase = await getSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (user) {
        console.log(`[SUPABASE CALL] auth.getUser() SUCCESS at ${timestamp} for ${user.email}`)
    } else {
        console.log(`[SUPABASE CALL] auth.getUser() EMPTY at ${timestamp}`)
    }
    
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