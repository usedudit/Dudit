import "server-only"
import { cache } from "react"
import { getSupabaseServerClient } from "@/lib/supabase/request-client"
import type { User } from "@supabase/supabase-js"
import { cookies, headers } from "next/headers"

// Request-scoped cache used in addition to React cache(). The headers object is
// unique to a request in the App Router, so this deduplicates auth.getUser()
// across server actions and helpers without trusting request headers.
const requestCache = new WeakMap<object, User | null>()

/**
 * Resolve identity exclusively through the current Supabase session.
 *
 * Middleware headers and client-provided x-user-* values are deliberately not
 * read here. Every security-sensitive action must receive the user returned
 * by Supabase Auth for the current request.
 */
export const getCurrentUser = cache(async (): Promise<User | null> => {
    let headerList: Awaited<ReturnType<typeof headers>>
    try {
        headerList = await headers()
    } catch {
        return null
    }

    if (requestCache.has(headerList)) {
        return requestCache.get(headerList) ?? null
    }

    // FAST-FAIL: If there are no Supabase auth cookies present on the request,
    // skip network calls to GoTrue auth.getUser().
    let cookieStore: Awaited<ReturnType<typeof cookies>>
    try {
        cookieStore = await cookies()
    } catch {
        return null
    }

    const hasAuthCookie = cookieStore
        .getAll()
        .some((c) => c.name.startsWith("sb-") && (c.name.includes("-auth-token") || c.name.endsWith("-token")))

    if (!hasAuthCookie) {
        requestCache.set(headerList, null)
        return null
    }

    if (process.env.DUDIT_REQUEST_TRACE === "true") {
        const requestId = headerList.get("x-dudit-request-id") || "missing"
        const startedAt = Number(headerList.get("x-dudit-request-start"))
        const elapsedMs = Number.isFinite(startedAt) ? Math.max(0, Date.now() - startedAt) : null
        console.log(`[DUDIT_TRACE] request=${requestId} phase=auth.getUser elapsedMs=${elapsedMs ?? "unknown"}`)
    }

    const supabase = await getSupabaseServerClient()
    const { data: { user }, error } = await supabase.auth.getUser()
    const resolvedUser = error ? null : (user || null)
    requestCache.set(headerList, resolvedUser)
    return resolvedUser
})

/**
 * Session-only resolver for non-security-critical UI state.
 * Security-sensitive code must use getCurrentUser().
 */
export const getCurrentSession = cache(async (): Promise<User | null> => {
    const supabase = await getSupabaseServerClient()
    const { data: { session } } = await supabase.auth.getSession()
    return session?.user || null
})
