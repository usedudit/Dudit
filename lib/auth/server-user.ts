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
// Request-scoped cache that works even in API Route Handlers where React cache() might be lost.
// Keyed by the headers() object which is unique per request in Next.js App Router.
const requestCache = new WeakMap<any, User | null>()

/**
 * Single request-scoped auth resolver.
 * Ensures `auth.getUser()` is called AT MOST ONCE per server request.
 * 1. Checks internal module-level request cache (deduplication across util functions in Route Handlers).
 * 2. Checks middleware headers (Fast path - no DB call).
 * 3. Fallback to Supabase verification (Slow path - cached for current request).
 */
export const getCurrentUser = cache(async (): Promise<User | null> => {
    // 0. Use headers() object as a request-specific identifier key
    let headerList: any
    try {
        headerList = await headers()
    } catch {
        // Fallback for cases where headers aren't available
        return null
    }

    // 1. Check module-level cache (Deduplicates calls within the same Node.js request lifecycle)
    if (requestCache.has(headerList)) {
        return requestCache.get(headerList)!
    }

    // 2. Try to get user from middleware headers (passed to the page/action)
    const userId = headerList.get("x-user-id")
    const userEmail = headerList.get("x-user-email")
    const skipAuthFallback = headerList.get("x-skip-auth-fallback") === "true"

    if (skipAuthFallback) {
        requestCache.set(headerList, null)
        return null
    }

    if (userId) {
        const user = {
            id: userId,
            email: userEmail || undefined,
            app_metadata: {},
            user_metadata: {},
            aud: "authenticated",
            created_at: "",
        } as User
        requestCache.set(headerList, user)
        return user
    }

    // 3. Fallback to full Supabase verification if headers are missing
    const supabase = await getSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()

    // Cache the result for subsequent calls in this request
    requestCache.set(headerList, user || null)
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