/**
 * Centralized rate limiting helper for server actions and API routes.
 *
 * Usage:
 *   await requireRateLimit(RateLimitCategory.PRODUCT_CREATE)
 *
 * Automatically detects userId or IP based on the category configuration.
 * Throws RateLimitError for auth endpoints (fail-closed).
 * Returns { error } for non-critical endpoints (fail-open).
 *
 * @module require-rate-limit
 */

import { headers } from "next/headers"
import {
    RateLimitCategory,
    IdentifierType,
    RATE_LIMIT_CONFIGS,
    getLimiter,
    RateLimitError,
} from "@/lib/rate-limiter"
import { getTrustedClientIP } from "@/lib/security/client-ip"

// ============================================================================
// IDENTIFIER RESOLUTION
// ============================================================================

/**
 * Get the client IP address from Next.js headers.
 * Uses platform IP data first. Proxy headers are accepted only when the
 * deployment explicitly declares that the proxy is trusted.
 */
async function getClientIP(platformIP?: string | null): Promise<string> {
    try {
        const headersList = await headers()
    return getTrustedClientIP(headersList, platformIP)
    } catch {
        return "unknown"
    }
}

import { getCurrentUser } from "@/lib/auth/server-user"

/**
 * Get the authenticated user ID from the current session.
 * Uses static import to ensure React cache() identity is preserved.
 * Returns null if not authenticated.
 */
async function getCurrentUserId(): Promise<string | null> {
    try {
        const user = await getCurrentUser()
        return user?.id || null
    } catch {
        return null
    }
}

/**
 * Build the rate limit identifier based on the category's identifier type.
 *
 * - IP: uses client IP (for unauthenticated routes)
 * - USER: uses user.id (for authenticated routes)
 * - USER_PLUS_IP: combines both (for sensitive actions)
 * - ENDPOINT: uses a provided endpoint name (for webhooks)
 */
async function buildIdentifier(
    identifierType: IdentifierType,
    endpointName?: string,
    platformIP?: string | null,
): Promise<string> {
    switch (identifierType) {
        case IdentifierType.IP: {
            const ip = await getClientIP(platformIP)
            return `ip:${ip}`
        }

        case IdentifierType.USER: {
            const userId = await getCurrentUserId()
            if (userId) return `user:${userId}`
            // Fallback to IP if user is not authenticated
            const ip = await getClientIP(platformIP)
            return `ip:${ip}`
        }

        case IdentifierType.USER_PLUS_IP: {
            const [userId, ip] = await Promise.all([
                getCurrentUserId(),
                getClientIP(platformIP),
            ])
            if (userId) return `user:${userId}:ip:${ip}`
            // Fallback to IP only if user is not authenticated
            return `ip:${ip}`
        }

        case IdentifierType.ENDPOINT: {
            return `endpoint:${endpointName || "unknown"}`
        }

        default:
            return `unknown:${Date.now()}`
    }
}

// ============================================================================
// MAIN HELPER
// ============================================================================

const localShortCircuitCache = new Map<string, { count: number; resetAt: number }>()
const LOCAL_SHORT_CIRCUIT_WINDOW_MS = 15_000
const LOCAL_SHORT_CIRCUIT_MAX_ENTRIES = 1000

/**
 * Bounded in-memory pre-check for non-critical (failClosed=false) rate limits.
 * Avoids hitting Upstash Redis during normal UI bursts while still escalating
 * to Redis as soon as traffic exceeds the local threshold in a 15s window.
 *
 * Returns true if the request can safely skip the remote Redis check.
 */
export function tryLocalRateLimitShortCircuit(
    category: RateLimitCategory,
    identifier: string,
    maxLocalFraction: number = 0.5,
): boolean {
    const config = RATE_LIMIT_CONFIGS[category]
    if (config.failClosed) return false

    const now = Date.now()
    if (localShortCircuitCache.size > LOCAL_SHORT_CIRCUIT_MAX_ENTRIES) {
        for (const [k, v] of localShortCircuitCache) {
            if (v.resetAt <= now) localShortCircuitCache.delete(k)
        }
    }

    const cacheKey = `${category}:${identifier}`
    const threshold = Math.max(10, Math.floor(config.maxRequests * maxLocalFraction))
    const cached = localShortCircuitCache.get(cacheKey)

    if (cached && cached.resetAt > now) {
        cached.count++
        return cached.count <= threshold
    }

    localShortCircuitCache.set(cacheKey, {
        count: 1,
        resetAt: now + LOCAL_SHORT_CIRCUIT_WINDOW_MS,
    })
    return true
}

/**
 * Rate-limit the current request based on the given category.
 *
 * For server actions, call this at the top of your function:
 *
 *   await requireRateLimit(RateLimitCategory.PRODUCT_CREATE)
 *
 * For API routes, call this at the top of your handler:
 *
 *   await requireRateLimit(RateLimitCategory.UPLOAD)
 *
 * For webhooks, pass the endpoint name:
 *
 *   await requireRateLimit(RateLimitCategory.WEBHOOK, "mercadopago-webhook")
 *
 * @throws {RateLimitError} if the rate limit is exceeded AND the category has failClosed=true
 * @returns {{ success: true }} if allowed, or {{ success: false, error: string }} if exceeded (for non-failClosed)
 */
export async function requireRateLimit(
    category: RateLimitCategory,
    endpointName?: string,
    platformIP?: string | null,
): Promise<{ success: boolean; error?: string }> {
    const config = RATE_LIMIT_CONFIGS[category]
    const limiter = getLimiter(category)

    try {
        const identifier = await buildIdentifier(
            config.identifierType,
            endpointName,
            platformIP,
        )

        // Memory pre-check for non-critical routes to save Redis commands during fast UI interaction
        if (tryLocalRateLimitShortCircuit(category, identifier)) {
            return { success: true }
        }

        const { success, reset } = await limiter.limit(identifier)

        if (!success) {
            const retryAfterMs = Math.max(0, reset - Date.now())

            if (config.failClosed) {
                throw new RateLimitError(category, retryAfterMs)
            }

            console.warn(
                `[RATE_LIMIT] Exceeded for category=${category} identifier=${identifier}`
            )
            return {
                success: false,
                error: "Muitas tentativas. Tente novamente em breve.",
            }
        }

        return { success: true }
    } catch (error) {
        // Re-throw RateLimitError (it was intentional)
        if (error instanceof RateLimitError) {
            throw error
        }

        // Redis connection failure or other unexpected error
        console.error(`[RATE_LIMIT] Redis error for category=${category}:`, error)

        if (config.failClosed) {
            // SECURITY: Auth routes must fail closed even if Redis is down
            throw new RateLimitError(category, 60000)
        }

        // Non-critical routes fail open (but we log the error for monitoring)
        return { success: true }
    }
}

/**
 * Check rate limit and return an error response for API routes.
 * Returns null if the request is allowed, or a formatted error if rate-limited.
 */
export async function checkRateLimitForAPI(
    category: RateLimitCategory,
    endpointName?: string,
    platformIP?: string | null,
): Promise<{
    limited: boolean
    status?: number
    body?: { error: string; retryAfter?: number }
}> {
    try {
        const result = await requireRateLimit(category, endpointName, platformIP)
        if (!result.success) {
            return {
                limited: true,
                status: 429,
                body: {
                    error: result.error || "Muitas tentativas. Tente novamente em breve.",
                    retryAfter: 60,
                },
            }
        }
        return { limited: false }
    } catch (error) {
        if (error instanceof RateLimitError) {
            return {
                limited: true,
                status: 429,
                body: {
                    error: "Muitas tentativas. Tente novamente em breve.",
                    retryAfter: Math.ceil(error.retryAfterMs / 1000),
                },
            }
        }
        // Should not reach here, but fail open for unexpected errors
        return { limited: false }
    }
}
