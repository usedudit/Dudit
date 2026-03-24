/**
 * @deprecated This file is intentionally left as a compatibility shim.
 * Use `import { requireRateLimit } from "@/lib/security/require-rate-limit"` instead.
 *
 * This re-exports the new centralized rate limiting system.
 */

export { requireRateLimit as checkRateLimit, requireRateLimit as checkRateLimitAction } from "./require-rate-limit"
export { RateLimitCategory } from "@/lib/rate-limiter"
