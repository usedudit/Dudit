import "server-only"
import { cache } from "react"
import { getSupabaseServerClient } from "@/lib/supabase/request-client"
import type { User } from "@supabase/supabase-js"

import { headers, cookies } from "next/headers"

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
 * 3. Decodes Supabase session cookie locally (Fast path 2 - no DB call).
 * 4. Fallback to Supabase verification (Slow path - cached for current request).
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

    // 3. Fast-path: Decode the Supabase JWT token from cookies locally.
    // Safe because the cookie has already passed through the Next.js Middleware.
    try {
        const cookieStore = await cookies()
        const authCookies = cookieStore.getAll()
            .filter(c => c.name.startsWith("sb-") && c.name.includes("-auth-token"))
            .sort((a, b) => a.name.localeCompare(b.name))

        if (authCookies.length > 0) {
            const rawValue = authCookies.map(c => c.value).join("")
            let accessToken: string | null = null
            if (rawValue.startsWith("[") || rawValue.startsWith("{")) {
                const parsed = JSON.parse(rawValue)
                accessToken = Array.isArray(parsed) ? parsed[0] : parsed.access_token
            } else {
                accessToken = rawValue
            }

            if (accessToken) {
                const parts = accessToken.split(".")
                if (parts.length === 3) {
                    const base64Payload = parts[1].replace(/-/g, "+").replace(/_/g, "/")
                    const payload = JSON.parse(Buffer.from(base64Payload, "base64").toString("utf-8"))
                    if (payload && payload.sub && payload.exp && payload.exp > Date.now() / 1000) {
                        const user = {
                            id: payload.sub,
                            email: payload.email || undefined,
                            app_metadata: {},
                            user_metadata: {},
                            aud: "authenticated",
                            created_at: "",
                        } as User
                        requestCache.set(headerList, user)
                        return user
                    }
                }
            }
        }
    } catch (e) {
        // Fallback silently to full Supabase getUser() below
    }

    // 4. Fallback to full Supabase verification if headers and cookie parsing are missing
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