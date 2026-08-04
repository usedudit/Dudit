import "server-only"
import { cache } from "react"
import { createHmac, timingSafeEqual as cryptoTimingSafeEqual } from "crypto"
import { getSupabaseServerClient } from "@/lib/supabase/request-client"
import type { User } from "@supabase/supabase-js"

import { headers, cookies } from "next/headers"

// ─── JWT Signature Verification ─────────────────────────────────────────────

/**
 * SECURITY: Verify a Supabase HS256 JWT's HMAC-SHA256 signature before trusting
 * the payload. Returns the decoded payload if valid, null if verification fails.
 *
 * This prevents forged JWT cookies from being trusted when the middleware
 * auth check is not executed (e.g., server actions, certain API routes).
 */
function verifyJwtSignature(token: string): any | null {
    const secret = process.env.SUPABASE_JWT_SECRET
    if (!secret) return null // No secret configured — cannot verify, fall through

    const parts = token.split(".")
    if (parts.length !== 3) return null

    try {
        // 1. Compute expected HMAC-SHA256 signature over "header.payload"
        const signatureInput = `${parts[0]}.${parts[1]}`
        const expectedSig = createHmac("sha256", secret)
            .update(signatureInput)
            .digest()

        // 2. Decode the provided signature (base64url → Buffer)
        const providedSig = Buffer.from(
            parts[2].replace(/-/g, "+").replace(/_/g, "/"),
            "base64"
        )

        // 3. Constant-time comparison to prevent timing attacks
        if (expectedSig.length !== providedSig.length) return null
        if (!cryptoTimingSafeEqual(expectedSig, providedSig)) return null

        // 4. Signature verified — decode and return payload
        const base64Payload = parts[1].replace(/-/g, "+").replace(/_/g, "/")
        return JSON.parse(Buffer.from(base64Payload, "base64").toString("utf-8"))
    } catch {
        return null
    }
}

// ─── Request Cache ──────────────────────────────────────────────────────────

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
 * 3. Verifies and decodes Supabase JWT from cookies locally (Fast path 2 - HMAC verified, no DB call).
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

    // 3. Fast-path: Verify and decode the Supabase JWT token from cookies locally.
    // SECURITY: The JWT signature is verified using HMAC-SHA256 against SUPABASE_JWT_SECRET
    // before trusting the payload. This prevents forged cookies from impersonating users
    // even if the middleware auth check was not executed for this request.
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
                // SECURITY FIX (HIGH-01): Verify JWT signature BEFORE trusting payload.
                // Previously, the payload was decoded and trusted without checking
                // the HMAC signature, allowing forged JWTs to impersonate any user.
                const payload = verifyJwtSignature(accessToken)
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