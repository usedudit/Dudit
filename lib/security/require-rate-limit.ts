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
async function getClientIP(): Promise<string> {
    try {
        const headersList = await headers()
        return getTrustedClientIP(headersList)
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
    endpointName?: string
): Promise<string> {
    switch (identifierType) {
        case IdentifierType.IP: {
            const ip = await getClientIP()
            return `ip:${ip}`
        }

        case IdentifierType.USER: {
            const userId = await getCurrentUserId()
            if (userId) return `user:${userId}`
            // Fallback to IP if user is not authenticated
            const ip = await getClientIP()
            return `ip:${ip}`
        }

        case IdentifierType.USER_PLUS_IP: {
            const [userId, ip] = await Promise.all([
                getCurrentUserId(),
                getClientIP(),
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
    endpointName?: string
): Promise<{ success: boolean; error?: string }> {
    const config = RATE_LIMIT_CONFIGS[category]
    const limiter = getLimiter(category)

    try {
        const identifier = await buildIdentifier(
            config.identifierType,
            endpointName
        )

        // Memory pre-check for non-critical routes to save Redis commands during fast UI interaction
        if (!config.failClosed) {
            const now = Date.now()
            const cached = localShortCircuitCache.get(identifier)
            if (cached && cached.resetAt > now) {
                cached.count++
                if (cached.count <= Math.max(3, Math.floor(config.maxRequests * 0.3))) {
                    return { success: true }
                }
            } else {
                localShortCircuitCache.set(identifier, { count: 1, resetAt: now + 5000 })
            }
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
    endpointName?: string
): Promise<{
    limited: boolean
    status?: number
    body?: { error: string; retryAfter?: number }
}> {
    try {
        const result = await requireRateLimit(category, endpointName)
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
