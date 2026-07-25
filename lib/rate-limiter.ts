/**
 * Production-grade rate limiting system using Upstash Redis.
 *
 * Uses strongly-typed categories instead of unsafe string matching.
 * Singleton Ratelimit instances per category for performance.
 *
 * @module rate-limiter
 */

import "server-only"
import { Ratelimit } from "@upstash/ratelimit"
import { redis } from "./redis"

// ============================================================================
// RATE LIMIT CATEGORIES (Strongly Typed)
// ============================================================================

export enum RateLimitCategory {
  AUTH_LOGIN = "AUTH_LOGIN",
  AUTH_REGISTER = "AUTH_REGISTER",
  AUTH_2FA = "AUTH_2FA",
  AUTH_EMAIL_CHANGE = "AUTH_EMAIL_CHANGE",
  AUTH_PASSWORD_CHANGE = "AUTH_PASSWORD_CHANGE",
  UPLOAD = "UPLOAD",
  PRODUCT_CREATE = "PRODUCT_CREATE",
  PRODUCT_UPDATE = "PRODUCT_UPDATE",
  PRODUCT_DELETE = "PRODUCT_DELETE",
  REPORT_CREATE = "REPORT_CREATE",
  ORDER_CREATE = "ORDER_CREATE",
  REVIEW_CREATE = "REVIEW_CREATE",
  PAYMENT = "PAYMENT",
  API_GENERAL = "API_GENERAL",
  WEBHOOK = "WEBHOOK",
  ADMIN = "ADMIN",
  ADMIN_ACTION = "ADMIN_ACTION",
  ADMIN_STEP_UP = "ADMIN_STEP_UP",
  ADMIN_READ = "ADMIN_READ",
  PARTNER_REGISTER = "PARTNER_REGISTER",
  ACCOUNT_DELETE = "ACCOUNT_DELETE",
  CART = "CART",
  ERP_GENERAL = "ERP_GENERAL",
  INVITE_CREATE = "INVITE_CREATE",
  INVITE_VALIDATE = "INVITE_VALIDATE",
  INVITE_ACCEPT = "INVITE_ACCEPT",
  UNOSEND_EMAIL = "UNOSEND_EMAIL",
  SUBSCRIPTION_CREATE = "SUBSCRIPTION_CREATE",
  SUBSCRIPTION_CANCEL = "SUBSCRIPTION_CANCEL",
  SUBSCRIPTION_WEBHOOK = "SUBSCRIPTION_WEBHOOK",
  REFUND_EXECUTE = "REFUND_EXECUTE",
  COLLECTION_CREATE = "COLLECTION_CREATE",
  COMMUNITY_VIDEO_UPLOAD = "COMMUNITY_VIDEO_UPLOAD",
  DEFAULT = "DEFAULT",
}

// ============================================================================
// IDENTIFIER TYPES
// ============================================================================

export enum IdentifierType {
  /** Use only IP address (for unauthenticated endpoints like login/register) */
  IP = "IP",
  /** Use only user ID (for authenticated endpoints) */
  USER = "USER",
  /** Use user ID + IP combined (for sensitive authenticated actions) */
  USER_PLUS_IP = "USER_PLUS_IP",
  /** Use endpoint name (for webhooks) */
  ENDPOINT = "ENDPOINT",
}

// ============================================================================
// RATE LIMIT CONFIGURATION
// ============================================================================

export interface RateLimitConfig {
  /** Maximum number of requests allowed in the window */
  maxRequests: number
  /** Window duration as string for Upstash (e.g. "15 m", "1 h", "60 s") */
  window: string
  /** How to identify the requester */
  identifierType: IdentifierType
  /** If true, requests are BLOCKED when Redis is unavailable (auth routes) */
  failClosed: boolean
}

/**
 * Production-safe rate limit configurations per category.
 *
 * These values are tuned for a real SaaS environment:
 * - Auth routes are strict to prevent brute-force
 * - CRUD routes allow reasonable throughput for power users
 * - Webhooks have high limits to avoid dropping valid events
 */
export const RATE_LIMIT_CONFIGS: Record<RateLimitCategory, RateLimitConfig> = {
  [RateLimitCategory.AUTH_LOGIN]: {
    maxRequests: 5,
    window: "15 m",
    identifierType: IdentifierType.IP,
    failClosed: true,
  },
  [RateLimitCategory.AUTH_REGISTER]: {
    maxRequests: 3,
    window: "1 h",
    identifierType: IdentifierType.IP,
    failClosed: true,
  },
  [RateLimitCategory.AUTH_2FA]: {
    maxRequests: 5,
    window: "15 m",
    identifierType: IdentifierType.USER_PLUS_IP,
    failClosed: true,
  },
  [RateLimitCategory.AUTH_EMAIL_CHANGE]: {
    maxRequests: 3,
    window: "1 h",
    identifierType: IdentifierType.USER_PLUS_IP,
    failClosed: true,
  },
  [RateLimitCategory.AUTH_PASSWORD_CHANGE]: {
    maxRequests: 5,
    window: "15 m",
    identifierType: IdentifierType.USER_PLUS_IP,
    failClosed: true,
  },
  [RateLimitCategory.UPLOAD]: {
    maxRequests: 20,
    window: "1 h",
    identifierType: IdentifierType.USER,
    failClosed: false,
  },
  [RateLimitCategory.PRODUCT_CREATE]: {
    maxRequests: 10,
    window: "10 m",
    identifierType: IdentifierType.USER,
    failClosed: false,
  },
  [RateLimitCategory.PRODUCT_UPDATE]: {
    maxRequests: 200,
    window: "1 h",
    identifierType: IdentifierType.USER,
    failClosed: false,
  },
  [RateLimitCategory.PRODUCT_DELETE]: {
    maxRequests: 50,
    window: "1 h",
    identifierType: IdentifierType.USER,
    failClosed: false,
  },
  [RateLimitCategory.REPORT_CREATE]: {
    // Reports are abuse-sensitive: combine user+IP and fail-closed to block
    // automated abuse rings even on Redis hiccups.
    maxRequests: 5,
    window: "1 h",
    identifierType: IdentifierType.USER_PLUS_IP,
    failClosed: true,
  },
  [RateLimitCategory.ORDER_CREATE]: {
    maxRequests: 30,
    window: "1 h",
    identifierType: IdentifierType.USER,
    failClosed: false,
  },
  [RateLimitCategory.REVIEW_CREATE]: {
    maxRequests: 20,
    window: "1 h",
    identifierType: IdentifierType.USER,
    failClosed: false,
  },
  [RateLimitCategory.PAYMENT]: {
    maxRequests: 10,
    window: "1 m",
    identifierType: IdentifierType.USER_PLUS_IP,
    failClosed: true,
  },
  [RateLimitCategory.API_GENERAL]: {
    maxRequests: 120,
    window: "1 m",
    identifierType: IdentifierType.USER,
    failClosed: false,
  },
  [RateLimitCategory.WEBHOOK]: {
    maxRequests: 500,
    window: "1 m",
    identifierType: IdentifierType.ENDPOINT,
    failClosed: false,
  },
  [RateLimitCategory.ADMIN]: {
    maxRequests: 100,
    window: "1 m",
    identifierType: IdentifierType.USER,
    failClosed: false,
  },
  [RateLimitCategory.ADMIN_ACTION]: {
    maxRequests: 30,
    window: "1 m",
    identifierType: IdentifierType.USER,
    failClosed: true,
  },
  [RateLimitCategory.ADMIN_STEP_UP]: {
    maxRequests: 5,
    window: "1 m",
    identifierType: IdentifierType.USER_PLUS_IP,
    failClosed: true,
  },
  [RateLimitCategory.ADMIN_READ]: {
    maxRequests: 120,
    window: "1 m",
    identifierType: IdentifierType.USER,
    failClosed: false,
  },
  [RateLimitCategory.PARTNER_REGISTER]: {
    maxRequests: 3,
    window: "1 h",
    identifierType: IdentifierType.IP,
    failClosed: true,
  },
  [RateLimitCategory.ACCOUNT_DELETE]: {
    maxRequests: 3,
    window: "1 h",
    identifierType: IdentifierType.USER_PLUS_IP,
    failClosed: true,
  },
  [RateLimitCategory.CART]: {
    maxRequests: 60,
    window: "1 m",
    identifierType: IdentifierType.USER,
    failClosed: false,
  },
  [RateLimitCategory.ERP_GENERAL]: {
    maxRequests: 200,
    window: "1 h",
    identifierType: IdentifierType.USER,
    failClosed: false,
  },
  [RateLimitCategory.INVITE_CREATE]: {
    maxRequests: 3,
    window: "1 h",
    identifierType: IdentifierType.USER_PLUS_IP,
    failClosed: true,
  },
  [RateLimitCategory.INVITE_VALIDATE]: {
    maxRequests: 10,
    window: "15 m",
    identifierType: IdentifierType.IP,
    failClosed: true,
  },
  [RateLimitCategory.INVITE_ACCEPT]: {
    maxRequests: 3,
    window: "15 m",
    identifierType: IdentifierType.USER_PLUS_IP,
    failClosed: true,
  },
  [RateLimitCategory.UNOSEND_EMAIL]: {
    maxRequests: 30,
    window: "1 h",
    identifierType: IdentifierType.USER,
    failClosed: true,
  },
  [RateLimitCategory.SUBSCRIPTION_CREATE]: {
    maxRequests: 10,
    window: "15 m",
    identifierType: IdentifierType.USER_PLUS_IP,
    failClosed: true,
  },
  [RateLimitCategory.SUBSCRIPTION_CANCEL]: {
    maxRequests: 10,
    window: "15 m",
    identifierType: IdentifierType.USER_PLUS_IP,
    failClosed: true,
  },
  [RateLimitCategory.SUBSCRIPTION_WEBHOOK]: {
    maxRequests: 500,
    window: "1 m",
    identifierType: IdentifierType.ENDPOINT,
    failClosed: false,
  },
  [RateLimitCategory.REFUND_EXECUTE]: {
    maxRequests: 3,
    window: "10 m",
    identifierType: IdentifierType.USER_PLUS_IP,
    failClosed: true,
  },
  [RateLimitCategory.COLLECTION_CREATE]: {
    maxRequests: 10,
    window: "1 h",
    identifierType: IdentifierType.USER,
    failClosed: false,
  },
  [RateLimitCategory.COMMUNITY_VIDEO_UPLOAD]: {
    maxRequests: 5,
    window: "1 h",
    identifierType: IdentifierType.USER,
    failClosed: false,
  },
  [RateLimitCategory.DEFAULT]: {
    maxRequests: 100,
    window: "1 m",
    identifierType: IdentifierType.USER,
    failClosed: false,
  },
}

// ============================================================================
// SINGLETON RATELIMIT INSTANCES (Performance: one per category)
// ============================================================================

const limiterCache = new Map<RateLimitCategory, Ratelimit>()

/**
 * Get or create a singleton Ratelimit instance for a given category.
 * Reuses instances to avoid unnecessary Redis connections.
 */
export function getLimiter(category: RateLimitCategory): Ratelimit {
  const existing = limiterCache.get(category)
  if (existing) return existing

  const config = RATE_LIMIT_CONFIGS[category]

  const limiter = new Ratelimit({
    redis: redis,
    limiter: Ratelimit.slidingWindow(config.maxRequests, config.window as any),
    analytics: false,
    prefix: `@rl/${category}`,
  })

  limiterCache.set(category, limiter)
  return limiter
}

// ============================================================================
// CUSTOM ERROR
// ============================================================================

export class RateLimitError extends Error {
  public readonly category: RateLimitCategory
  public readonly retryAfterMs: number

  constructor(category: RateLimitCategory, retryAfterMs: number = 60000) {
    super(`Rate limit exceeded for category: ${category}`)
    this.name = "RateLimitError"
    this.category = category
    this.retryAfterMs = retryAfterMs
  }
}
